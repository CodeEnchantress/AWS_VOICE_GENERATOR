import boto3
import json
import os
from botocore.exceptions import ClientError

s3 = boto3.client('s3')
BUCKET_NAME = 'rekognition-upload-bucket-001'

# Common headers for CORS
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",  # Replace with your frontend domain in production
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
}

def lambda_handler(event, context):
    try:
        print("event ->", json.dumps(event))

        # Get the image key (?image_key=...)
        params = event.get("queryStringParameters") or {}
        image_key = params.get("image_key")
        if not image_key:
            raise ValueError("Missing query param: image_key")

        # Build S3 keys for the audio and description files
        base_name = os.path.splitext(os.path.basename(image_key))[0]
        audio_key = f"audio/{base_name}_labels.mp3"
        desc_key = f"audio/{base_name}_labels.json"

        # 1. Check if the audio file exists in S3
        try:
            s3.head_object(Bucket=BUCKET_NAME, Key=audio_key)
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == "404":
                # Return 404 so React knows it's still compiling
                return {
                    "statusCode": 404,
                    "headers": CORS_HEADERS,
                    "body": json.dumps({"status": "generating", "message": "Audio is not ready yet."})
                }
            elif error_code == "403":
                # Return 500 with helpful instruction if S3 access is Denied
                return {
                    "statusCode": 500,
                    "headers": CORS_HEADERS,
                    "body": json.dumps({
                        "error": f"S3 Access Denied (403) on HeadObject for {audio_key}. "
                                 f"Please ensure the returnS3url Lambda execution role has 's3:GetObject' "
                                 f"permissions on the S3 bucket: {BUCKET_NAME}."
                    })
                }
            raise e

        # 2. Fetch the text description from the S3 JSON file
        description = ""
        try:
            desc_obj = s3.get_object(Bucket=BUCKET_NAME, Key=desc_key)
            desc_data = json.loads(desc_obj['Body'].read().decode('utf-8'))
            description = desc_data.get('description', '')
        except Exception as err:
            print(f"Could not read description file: {err}")
            description = "Description text could not be loaded."

        # 3. Generate the pre-signed URL for the audio file
        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": audio_key},
            ExpiresIn=3600
        )

        return {
            "statusCode": 200,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps({
                "url": presigned_url,
                "description": description
            })
        }

    except Exception as e:
        print("error ->", str(e))
        return {
            "statusCode": 500,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)})
        }
