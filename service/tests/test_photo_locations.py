"""Mission points at Curiosity photo stops: base near Nevado Sajama, destinations at Navcam 360 stops."""
import json
from pathlib import Path
import unittest
from service.gale import gale_registry
from service.planning import PreparedPlanner
from service.exchange import plan_draft
from service.validation import PlanningInputError

MANIFEST = Path('data/processed/gale/analytical/manifest.json')
# Destination POI -> Navcam stop sol whose 360 panorama is the visual reference.
STOPS = {'sample': 4818, 'control': 4844, 'lookout': 4571}


class PhotoLocations(unittest.TestCase):
    def setUp(self):
        if not MANIFEST.with_name('terrain.npz').exists():
            self.skipTest('Verified real archive unavailable; run python -m scripts.prepare_gale --factor 2.')

    def test_teams_of_at_least_15_degrees_return_from_each_destination(self):
        planner = PreparedPlanner(gale_registry(MANIFEST))
        req = json.loads(Path('service/examples/gale-replay.request.json').read_text())
        default = json.loads(MANIFEST.read_text())['planning_team']
        teams = [default, {'humans': [{'profile_id': 'explorer_02', 'payload_kg': 0}], 'robots': []},
                 {'humans': [{'profile_id': 'explorer_04', 'payload_kg': 0}], 'robots': [{'profile_id': 'transport_rover', 'payload_kg': 0}]}]
        durations = {}
        for team in teams:
            for destination in STOPS:
                with self.subTest(team=team, destination=destination):
                    req['team'] = {**team, 'catalog_version': req['team']['catalog_version']}
                    req['destination']['poi_id'] = destination
                    a = plan_draft(planner, req)['alternatives'][0]
                    self.assertEqual((a['outbound']['status'], a['return']['status']), ('found', 'found'))
                    self.assertEqual(a['assessment'], 'viable_model')
                    self.assertEqual(a['metrics']['elapsed_s'], a['outbound']['duration_s'] + a['return']['duration_s'] + 600)
                    if team is default:
                        durations[destination] = a['metrics']['elapsed_s']
        # Short, medium and long missions for the default team.
        self.assertLess(durations['sample'], durations['control'])
        self.assertLess(durations['control'], durations['lookout'])

    def test_eight_degree_rover_cannot_connect_here(self):
        planner = PreparedPlanner(gale_registry(MANIFEST))
        req = json.loads(Path('service/examples/gale-replay.request.json').read_text())
        req['team']['robots'] = [{'profile_id': 'support_rover', 'payload_kg': 0}]
        try:
            a = plan_draft(planner, req)['alternatives'][0]
        except PlanningInputError as exc:
            self.assertEqual(exc.code, 'endpoint_terrain_limit')
        else:
            self.assertNotEqual(a['assessment'], 'viable_model')

    def test_points_are_at_the_panorama_stops(self):
        import numpy as np
        raw = json.loads(MANIFEST.read_text())
        pano = json.loads(Path('app/src/panoramas/panoramas.json').read_text())['panoramas']
        nav = json.loads(Path('app/src/panoramas/navcam_panoramas.json').read_text())['panoramas']
        scene = lambda poi: np.radians(poi['lonlat']) * 3396190 + [-25, 35]
        observed = lambda lonlat: np.radians(lonlat) * 3396190
        pois = {p['id']: p for p in raw['pois']}
        self.assertEqual(set(pois), {'base', *STOPS})
        sajama = next(p for p in pano if p['id'] == 'pano_nevado_sajama')['lonlat']
        self.assertLess(float(np.linalg.norm(scene(pois['base']) - observed(sajama))), 50)
        for poi, sol in STOPS.items():
            stop = next(p for p in nav if p['sol'] == sol)['lonlat']
            self.assertLess(float(np.linalg.norm(scene(pois[poi]) - observed(stop))), 5, poi)
        previous = json.loads(Path('docs/handoffs/MISSION_DEMO_LOCATIONS.json').read_text())
        self.assertEqual(previous['old_array_hashes'], raw['arrays']['sha256'])
