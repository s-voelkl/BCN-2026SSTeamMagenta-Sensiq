import os
import json

def handler(event, context):
    athena_workgroup = os.environ.get('ATHENA_WORKGROUP')
    database_name = os.environ.get('DATABASE_NAME')
    
    return {
        'statusCode': 200,
        'body': json.dumps('History Lambda executed remotely.')
    }