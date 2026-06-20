import json
import boto3
import base64
import os

s3 = boto3.client('s3')
BUCKET_NAME = 'rekognition-upload-bucket-001'

# ─── CORS Headers ───
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
}

def lambda_handler(event, context):
    # Handle preflight OPTIONS request from the browser
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': ''
        }

    try:
        # Support both Proxy Integration (event['body']) and Custom Integration
        body = event
        if 'body' in event and isinstance(event['body'], str):
            try:
                body = json.loads(event['body'])
            except Exception:
                pass
        elif 'body' in event and isinstance(event['body'], dict):
            body = event['body']

        filename = body.get('filename', 'default_filename.jpg')
        file_data = base64.b64decode(body.get('file'))

        content_type = 'image/jpeg'
        if filename.lower().endswith('.png'):
            content_type = 'image/png'

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=f'uploads_image/{filename}',
            Body=file_data,
            ContentType=content_type
        )

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,  # CORS Headers are crucial here
            'body': json.dumps({'message': f"Image '{filename}' uploaded successfully!"})
        }

    except Exception as e:
        print(e)
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
