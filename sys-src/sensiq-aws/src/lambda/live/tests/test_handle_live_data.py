import json
import unittest
from unittest.mock import MagicMock, patch
import live.handle_live_data as handle_live_data
from datetime import datetime, timezone, timedelta


class TestHandleLiveData(unittest.TestCase):
    
    @patch('live.handle_live_data.dynamodb')
    def test_get_item_with_device_id_online(self, mock_db):
        recent_timestamp = (datetime.now(timezone.utc) - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        
        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            'Item': {
                'device_id': 'esp32-lab-001',
                'timestamp': recent_timestamp,
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
    def test_invalid_timestamp_format_returns_200(self, mock_db):
        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            'Item': {
                'device_id': 'esp32-lab-001',
                'timestamp': 'wrong-format-completely',
                'dht_temperature': 22.0
            }
        }
        mock_db.Table.return_value = mock_table
        event = {'queryStringParameters': {'device_id': 'esp32-lab-001'}}
        result = handle_live_data.handler(event)
        self.assertEqual(result['statusCode'], 200)    

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
    
    @patch('live.handle_live_data.dynamodb')
    @patch('live.handle_live_data.datetime')
    def test_device_offline_with_static_timestamp(self, mock_datetime, mock_db):
        frozen_now = datetime(2026, 6, 8, 10, 11, 0, tzinfo=timezone.utc)
        mock_datetime.now.return_value = frozen_now
        mock_datetime.strptime = datetime.strptime

        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            'Item': {
                'device_id': 'esp32-lab-002',
                'timestamp': '2026-06-08T10:01:00Z',
                'dht_temperature': 25.0
            }
        }
        mock_db.Table.return_value = mock_table
        
        event = {'queryStringParameters': {'device_id': 'esp32-lab-002'}}
        result = handle_live_data.handler(event)
        
        self.assertEqual(result['statusCode'], 437)
        body = json.loads(result['body'])
        self.assertEqual(body['message'], 'Device is offline')    
        
            
    @patch('live.handle_live_data.dynamodb')
    def test_decimal_serialization_success(self, mock_db):
        from decimal import Decimal
        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            'Item': {
                'device_id': 'esp32-lab-001',
                'dht_temperature': Decimal('22.5'),
                'dht_humidity': Decimal('55.0')
            }
        }
        mock_db.Table.return_value = mock_table
        event = {'queryStringParameters': {'device_id': 'esp32-lab-001'}}
        result = handle_live_data.handler(event)
        
        self.assertEqual(result['statusCode'], 200)
        body = json.loads(result['body'])
        self.assertEqual(body['dht_temperature'], 22.5)
        self.assertEqual(body['dht_humidity'], 55.0)

    @patch('live.handle_live_data.dynamodb')
    def test_item_without_timestamp_key_returns_200(self, mock_db):
        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            'Item': {
                'device_id': 'esp32-lab-001',
                'dht_temperature': 24.0
            }
        }
        mock_db.Table.return_value = mock_table
        event = {'queryStringParameters': {'device_id': 'esp32-lab-001'}}
        result = handle_live_data.handler(event)
        
        self.assertEqual(result['statusCode'], 200)
        body = json.loads(result['body'])
        self.assertEqual(body['device_id'], 'esp32-lab-001')
        self.assertNotIn('timestamp', body)    

    @patch('live.handle_live_data.dynamodb')
    def test_cors_headers_are_always_present(self, mock_db):
        event = {} 
        result = handle_live_data.handler(event)
        
        self.assertIn('headers', result)
        headers = result['headers']
        
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(headers.get('Content-Type'), 'application/json')
        self.assertIn('GET', headers.get('Access-Control-Allow-Methods', ''))        
        


if __name__ == '__main__':
    unittest.main()