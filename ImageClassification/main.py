from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input, decode_predictions
import numpy as np
from PIL import Image
import io

app = FastAPI()

# Allow React to call API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in production, restrict this
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load pre-trained MobileNetV2 model
print("Loading MobileNetV2 model...")
model = MobileNetV2(weights='imagenet')
print("Model loaded successfully!")

@app.get("/")
async def root():
    return {"message": "CNN Image Classifier API is running"}

@app.post("/predict")
async def predict_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        
        # Open and preprocess image
        img = Image.open(io.BytesIO(contents)).convert('RGB')
        img = img.resize((224, 224))  # MobileNetV2 expects 224x224
        img_array = np.array(img)
        img_array = np.expand_dims(img_array, axis=0)
        img_array = preprocess_input(img_array)
        
        # Make prediction
        preds = model.predict(img_array, verbose=0)
        
        # Decode predictions
        decoded_preds = decode_predictions(preds, top=3)[0]
        
        result = {
            "class": decoded_preds[0][1],
            "confidence": round(float(decoded_preds[0][2]) * 100, 2),
            "model": "MobileNetV2",
            "topPredictions": [
                {
                    "class": pred[1],
                    "confidence": round(float(pred[2]) * 100, 2)
                }
                for pred in decoded_preds
            ]
        }
        
        return result
    
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"error": str(e)}
        )
