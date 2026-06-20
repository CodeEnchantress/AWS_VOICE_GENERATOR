import React, { useState } from "react";
import "./ImageUpload.css";

const API_BASE = "https://5xjamreg36.execute-api.ap-south-1.amazonaws.com/dev";
const API_UPLOAD = API_BASE;
const API_GET_AUDIO_URL = API_BASE;

export default function ImageUpload() {
  const [image, setImage] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [status, setStatus] = useState("idle");

  const handleFileChange = (e) => {
    setImage(e.target.files[0] ?? null);
    setAudioUrl(null);
    setStatus("idle");
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
    });

  const handleUpload = async () => {
    if (!image) return;

    try {
      setStatus("Uploading image...");

      const base64 = await fileToBase64(image);
      const uploadRes = await fetch(API_UPLOAD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: image.name, file: base64 }),
      });

      if (!uploadRes.ok) throw new Error("Image upload failed");

      const imageKey = image.name;

      setStatus("Generating audio...");

      await new Promise((res) => setTimeout(res, 5000));

      const response = await fetch(`${API_GET_AUDIO_URL}?image_key=${encodeURIComponent(imageKey)}`);
      const data = await response.json();
      const url = data.url;

      if (!url) throw new Error("Audio generation timed out");

      setAudioUrl(url);
      setStatus("Audio is ready 🎧");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Unexpected error");
    }
  };

  return (
    <div className="container">
      <h2>Image to Audio</h2>

      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
      />

      <button
        className="upload-btn"
        onClick={handleUpload}
        disabled={!image || status.includes("Uploading") || status.includes("Generating")}
      >
        {status.includes("Uploading") || status.includes("Generating") ? "Processing..." : "Upload"}
      </button>

      {status !== "idle" && <div className="status">{status}</div>}

      {audioUrl && (
        <audio controls src={audioUrl} />
      )}
    </div>
  );
}
