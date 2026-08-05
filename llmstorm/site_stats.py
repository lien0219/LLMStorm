"""Persistent site counters and live visitor presence."""

from __future__ import annotations

import asyncio
import contextlib
import secrets
import sqlite3
import string
import time
from pathlib import Path
from typing import Any


class SiteStats:
    """Keep durable page-view/like counters and in-memory live presence."""

    def __init__(
        self,
        database_path: str | Path,
        *,
        synthetic_min_seconds: float = 18.0,
        synthetic_max_seconds: float = 36.0,
    ) -> None:
        self.database_path = str(database_path)
        self.synthetic_min_seconds = synthetic_min_seconds
        self.synthetic_max_seconds = synthetic_max_seconds
        self._connection: sqlite3.Connection | None = None
        self._lock = asyncio.Lock()
        self._sessions: dict[str, tuple[str, asyncio.Queue[dict[str, Any]]]] = {}
        self._views = 0
        self._likes = 0
        self._synthetic_online = 10
        self._next_synthetic_shift = 0.0
        self._simulation_task: asyncio.Task[None] | None = None
        self._random = secrets.SystemRandom()

    async def start(self) -> None:
        if self._connection is not None:
            return
        if self.database_path != ":memory:":
            Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS counters ("
            "name TEXT PRIMARY KEY, value INTEGER NOT NULL CHECK(value >= 0))"
        )
        connection.executemany(
            "INSERT OR IGNORE INTO counters(name, value) VALUES (?, 0)",
            (("views",), ("likes",)),
        )
        connection.commit()
        rows = dict(connection.execute("SELECT name, value FROM counters"))
        self._connection = connection
        self._views = int(rows.get("views", 0))
        self._likes = int(rows.get("likes", 0))
        self._synthetic_online = self._random.randint(10, 20)
        self._schedule_synthetic_shift()
        self._simulation_task = asyncio.create_task(self._simulation_loop())

    async def close(self) -> None:
        task = self._simulation_task
        self._simulation_task = None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    async def record_view(self) -> dict[str, Any]:
        async with self._lock:
            self._views = self._increment_counter("views")
            snapshot = self._snapshot_locked()
            self._broadcast_locked("snapshot", snapshot)
            return snapshot

    async def add_like(self) -> dict[str, Any]:
        async with self._lock:
            self._likes = self._increment_counter("likes")
            event = {
                "eventId": secrets.token_hex(8),
                "anonymousId": "".join(
                    self._random.choice(string.ascii_uppercase + string.digits)
                    for _ in range(6)
                ),
            }
            payload = {"stats": self._snapshot_locked(), "like": event}
            self._broadcast_locked("like", payload)
            return payload

    async def snapshot(self) -> dict[str, Any]:
        async with self._lock:
            return self._snapshot_locked()

    async def connect(
        self,
        visitor_id: str,
        session_id: str,
    ) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=32)
        async with self._lock:
            self._sessions[session_id] = (visitor_id, queue)
            self._broadcast_locked("snapshot", self._snapshot_locked())
        return queue

    async def disconnect(
        self,
        session_id: str,
        queue: asyncio.Queue[dict[str, Any]],
    ) -> None:
        async with self._lock:
            current = self._sessions.get(session_id)
            if current is None or current[1] is not queue:
                return
            del self._sessions[session_id]
            self._broadcast_locked("snapshot", self._snapshot_locked())

    def _increment_counter(self, name: str) -> int:
        if self._connection is None:
            raise RuntimeError("Site statistics service has not started")
        self._connection.execute("UPDATE counters SET value = value + 1 WHERE name = ?", (name,))
        value = int(
            self._connection.execute(
                "SELECT value FROM counters WHERE name = ?", (name,)
            ).fetchone()[0]
        )
        self._connection.commit()
        return value

    def _real_online_locked(self) -> int:
        return len({visitor_id for visitor_id, _ in self._sessions.values()})

    def _snapshot_locked(self) -> dict[str, Any]:
        real_online = self._real_online_locked()
        synthetic = real_online < 10
        return {
            "online": self._synthetic_online if synthetic else real_online,
            "realOnline": real_online,
            "synthetic": synthetic,
            "views": self._views,
            "likes": self._likes,
        }

    def _broadcast_locked(self, event: str, payload: dict[str, Any]) -> None:
        message = {"event": event, "data": payload}
        for _, queue in self._sessions.values():
            if queue.full():
                with contextlib.suppress(asyncio.QueueEmpty):
                    queue.get_nowait()
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(message)

    def _schedule_synthetic_shift(self) -> None:
        delay = self._random.uniform(self.synthetic_min_seconds, self.synthetic_max_seconds)
        self._next_synthetic_shift = time.monotonic() + delay

    def _shift_synthetic_online(self) -> None:
        if self._synthetic_online <= 10:
            self._synthetic_online = 11
        elif self._synthetic_online >= 20:
            self._synthetic_online = 19
        else:
            self._synthetic_online += self._random.choice((-1, 1))

    async def _simulation_loop(self) -> None:
        while True:
            await asyncio.sleep(min(5.0, self.synthetic_min_seconds))
            async with self._lock:
                if self._real_online_locked() >= 10:
                    self._schedule_synthetic_shift()
                    continue
                if time.monotonic() < self._next_synthetic_shift:
                    continue
                self._shift_synthetic_online()
                self._schedule_synthetic_shift()
                self._broadcast_locked("snapshot", self._snapshot_locked())
