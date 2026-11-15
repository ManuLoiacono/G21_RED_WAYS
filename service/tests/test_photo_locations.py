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

    def test_points_are_inside_registered_photo_footprint_and_near_markers(self):
        import math
        import numpy as np
        from scipy.spatial import ConvexHull
        from service.gale import load_gale
        manifest=Path('data/processed/gale/analytical/manifest.json')
        if not manifest.with_name('terrain.npz').exists():
            self.skipTest('Verified real archive unavailable; prepare_gale --factor 2.')
        raw=json.loads(manifest.read_text())
        photos=[]
        for filename in ['panoramas.json','navcam_panoramas.json']:
            photos.extend(json.loads(Path('app/src/panoramas',filename).read_text())['panoramas'])
        observed=np.radians([p['lonlat'] for p in photos])*3396190
        hull=ConvexHull(observed)
        parcel=load_gale(manifest)
        self.assertEqual({p['id'] for p in raw['pois']},{'base','sample','control','lookout'})
        self.assertEqual(len({tuple(p['lonlat']) for p in raw['pois']}),4)
        for poi in raw['pois']:
            scene=np.radians(poi['lonlat'])*3396190+[-25,35]
            self.assertTrue(np.all(hull.equations[:,:2]@scene+hull.equations[:,2] <= 1e-6))
            distance=float(np.linalg.norm(observed-scene,axis=1).min())
            self.assertLess(distance,50)
            if poi['id']=='base': self.assertLess(distance,3)
        previous=json.loads(Path('docs/handoffs/MISSION_DEMO_LOCATIONS.json').read_text())
        self.assertEqual(previous['old_array_hashes'],raw['arrays']['sha256'])
