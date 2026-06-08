import json
import unittest
from unittest.mock import MagicMock, patch
import live.handle_live_data as handle_live_data


class TestHandleLiveData(unittest.TestCase):

    @patch('live.handle_live_data.dynamodb')
    def test_get_item_with_device_id(self, mock_db):
        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            'Item': {
                'device_id': 'esp32-lab-001',
                'timestamp': '2026-06-01T10:00:00',
                'dht_temperature': 22.0
            }
        }
        mock_db.Table.return_value = mock_table
        event = {'queryStringParameters': {'device_id': 'esp32-lab-001'}}
        result = handle_live_data.handler(event)
        self.assertEqual(result['statusCode'], 200)
        body = json.loads(result['body'])
        self.assertEqual(body['device_id'], 'esp32-lab-001')

    @patch('live.handle_live_data.dynamodb')
    def test_device_not_found_returns_404(self, mock_db):
        mock_table = MagicMock()
        mock_table.get_item.return_value = {}
        mock_db.Table.return_value = mock_table
        event = {'queryStringParameters': {'device_id': 'esp32-unknown'}}
        result = handle_live_data.handler(event)
        self.assertEqual(result['statusCode'], 404)

    @patch('live.handle_live_data.dynamodb')
    def test_missing_device_id_returns_400(self, mock_db):
        event = {'queryStringParameters': None}
        result = handle_live_data.handler(event)
        self.assertEqual(result['statusCode'], 400)
        body = json.loads(result['body'])
        self.assertEqual(body['error'], 'Missing required parameter: device_id')

    @patch('live.handle_live_data.dynamodb')
    def test_dynamodb_error_returns_500(self, mock_db):
        mock_table = MagicMock()
        mock_table.get_item.side_effect = Exception("Connection error")
        mock_db.Table.return_value = mock_table
        event = {'queryStringParameters': {'device_id': 'esp32-lab-001'}}
        result = handle_live_data.handler(event)
        self.assertEqual(result['statusCode'], 500)


if __name__ == '__main__':
    unittest.main()