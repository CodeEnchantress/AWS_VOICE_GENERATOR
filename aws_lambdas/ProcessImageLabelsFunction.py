import json
import boto3
import base64
import urllib.parse
import urllib.request
import os

s3 = boto3.client('s3')
polly = boto3.client('polly')

# Load the API Key from Lambda environment variables
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')

def lambda_handler(event, context):
    try:
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY environment variable is not set in Lambda configuration.")

        # Get S3 upload metadata
        bucket_name = event['Records'][0]['s3']['bucket']['name']
        raw_key = event['Records'][0]['s3']['object']['key']
        image_key = urllib.parse.unquote_plus(raw_key)
        print(f"Triggered by image: {image_key} in bucket: {bucket_name}")
        
        # 1. Fetch image from S3
        s3_response = s3.get_object(Bucket=bucket_name, Key=image_key)
        image_bytes = s3_response['Body'].read()
        
        # 2. Base64 encode the image
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        
        media_type = "image/jpeg"
        if image_key.lower().endswith(".png"):
            media_type = "image/png"
        
        # 3. Call Google Gemini 1.5 Flash API directly using urllib (with correct snake_case keys)
        payload = {
            "contents": [{
                "parts": [
                    {
                        "text": "Describe this image in detail in 1 or 2 clear, descriptive sentences. Focus on what is happening. Do not say 'This image shows' or 'In the photo', just directly describe it."
                    },
                    {
                        "inline_data": {
                            "mime_type": media_type,
                            "data": base64_image
                        }
                    }
                ]
            }]
        }
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        
        print("Calling Google Gemini 1.5 Flash API...")
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            
        # Parse the description text from response
        label_text = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
        print(f"Generated Description: {label_text}")
        
        # Extract filename base
        base_name = os.path.splitext(os.path.basename(image_key))[0]
        
        # 4. Save description text JSON to S3
        desc_key = f"audio/{base_name}_labels.json"
        s3.put_object(
            Bucket=bucket_name,
            Key=desc_key,
            Body=json.dumps({"description": label_text}),
            ContentType='application/json'
        )
        
        # 5. Call Polly to generate speech
        polly_response = polly.synthesize_speech(
            Text=label_text,
            OutputFormat='mp3',
            VoiceId='Joanna'
        )
        
        # Save audio to S3
        audio_key = f"audio/{base_name}_labels.mp3"
        s3.put_object(
            Bucket=bucket_name,
            Key=audio_key,
            Body=polly_response['AudioStream'].read(),
            ContentType='audio/mp3'
        )
        print("Audio and description successfully generated.")
        
        return {
            'statusCode': 200,
            'body': json.dumps({'message': f"Processed '{image_key}' successfully!"})
        }

    except Exception as e:
        print("Error occurred:", e)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
