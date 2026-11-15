"""Connectivity of the photo-sector POIs with unchanged hypothetical team limits."""
import json
from pathlib import Path
import unittest
from service.gale import gale_registry
from service.planning import PreparedPlanner
from service.exchange import plan_draft
class PhotoLocations(unittest.TestCase):
    def test_default_and_representative_teams_return_from_each_destination(self):
        manifest=Path('data/processed/gale/analytical/manifest.json')
        if not manifest.with_name('terrain.npz').exists():
            self.skipTest('Verified real archive unavailable; run python -m scripts.prepare_gale --factor 2.')
        planner=PreparedPlanner(gale_registry(manifest))
        req=json.loads(Path('service/examples/gale-replay.request.json').read_text())
        default=req['team']
        teams=[default,{**default,'robots':[],'humans':[{'profile_id':'explorer_02','payload_kg':0}]},
               {**default,'humans':[{'profile_id':'explorer_03','payload_kg':0}],'robots':[{'profile_id':'transport_rover','payload_kg':0}]}]
        for team in teams:
            for destination in ['sample','control','lookout']:
                with self.subTest(team=team,destination=destination):
                    req['team']=team;req['destination']['poi_id']=destination
                    r=plan_draft(planner,req);a=r['alternatives'][0]
                    self.assertEqual((a['outbound']['status'],a['return']['status']),('found','found'))
                    self.assertEqual(a['assessment'],'viable_model')
                    self.assertEqual(a['metrics']['elapsed_s'],a['outbound']['duration_s']+a['return']['duration_s']+600)
