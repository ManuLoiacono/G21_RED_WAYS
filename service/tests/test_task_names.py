import copy
import unittest
from service.exchange import decode_request
from service.validation import PlanningInputError
from service.example import example_requests
class TaskNames(unittest.TestCase):
    def test_normalized_duplicate(self):
        import json
        from pathlib import Path
        request=json.loads(Path('service/examples/gale-replay.request.json').read_text())
        request['mission']['tasks']=[{'id':'one','name':' Rock  sample ','duration_s':1},{'id':'two','name':'rock sample','duration_s':2}]
        with self.assertRaises(PlanningInputError) as error: decode_request(request)
        self.assertEqual(error.exception.code,'duplicate_task_name')
        request['mission']['tasks'][1]['name']='Other sample'
        decode_request(request)
