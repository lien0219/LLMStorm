from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from llmstorm.site_stats import SiteStats


class SiteStatsTests(unittest.IsolatedAsyncioTestCase):
    async def test_counters_are_persistent_and_likes_only_increase(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stats.db"
            stats = SiteStats(path)
            await stats.start()
            self.assertEqual((await stats.record_view())["views"], 1)
            first_like = await stats.add_like()
            second_like = await stats.add_like()
            self.assertEqual(first_like["stats"]["likes"], 1)
            self.assertEqual(second_like["stats"]["likes"], 2)
            await stats.close()

            restored = SiteStats(path)
            await restored.start()
            snapshot = await restored.snapshot()
            self.assertEqual(snapshot["views"], 1)
            self.assertEqual(snapshot["likes"], 2)
            await restored.close()

    async def test_presence_deduplicates_visitors_and_disables_synthetic_floor_at_ten(self) -> None:
        stats = SiteStats(":memory:")
        await stats.start()
        connections = []
        try:
            first_session = "session_same_00000001"
            second_session = "session_same_00000002"
            connections.append(
                (first_session, await stats.connect("visitor_00000001", first_session))
            )
            connections.append(
                (second_session, await stats.connect("visitor_00000001", second_session))
            )
            low_snapshot = await stats.snapshot()
            self.assertEqual(low_snapshot["realOnline"], 1)
            self.assertGreaterEqual(low_snapshot["online"], 10)
            self.assertLessEqual(low_snapshot["online"], 20)
            self.assertTrue(low_snapshot["synthetic"])

            previous = stats._synthetic_online
            for _ in range(40):
                stats._shift_synthetic_online()
                self.assertNotEqual(stats._synthetic_online, previous)
                self.assertGreaterEqual(stats._synthetic_online, 10)
                self.assertLessEqual(stats._synthetic_online, 20)
                previous = stats._synthetic_online

            for index in range(2, 11):
                session_id = f"session_live_{index:08d}"
                connections.append(
                    (
                        session_id,
                        await stats.connect(f"visitor_{index:08d}", session_id),
                    )
                )
            live_snapshot = await stats.snapshot()
            self.assertEqual(live_snapshot["realOnline"], 10)
            self.assertEqual(live_snapshot["online"], 10)
            self.assertFalse(live_snapshot["synthetic"])
        finally:
            for session_id, queue in connections:
                await stats.disconnect(session_id, queue)
            await stats.close()
