import React, { useState, useEffect, useRef } from "react";
import "./Dashboard.css";

const API_BASE = "https://5xjamreg36.execute-api.ap-south-1.amazonaws.com/dev";
const API_UPLOAD = API_BASE;
const API_GET_AUDIO_URL = API_BASE;

export default function Dashboard({ user, onLogout }) {
  const [image, setImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("idle");
  const [history, setHistory] = useState([]);
  const [lastUploadedKey, setLastUploadedKey] = useState(null);
  
  const audioPlayerRef = useRef(null);

  // Load user scan history on mount
  useEffect(() => {
    if (user && user.email) {
      const savedHistory = JSON.parse(
        localStorage.getItem(`scans_${user.email.toLowerCase()}`) || "[]"
      );
      setHistory(savedHistory);
    }
  }, [user]);

  // Clean up object URL on unmount or when image changes
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }

    if (file) {
      setImage(file);
      setImagePreviewUrl(URL.createObjectURL(file));
      setAudioUrl(null);
      setDescription("");
      setStatus("idle");
      setLastUploadedKey(null);
    }
  };

  const handleRemoveImage = () => {
    setImage(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
    setAudioUrl(null);
    setDescription("");
    setStatus("idle");
    setLastUploadedKey(null);
  };

  const sanitizeFilename = (name) => {
    let sanitized = name.replace(/[^a-zA-Z0-9.-]/g, "_");
    if (sanitized.toLowerCase().endsWith(".jfif")) {
      sanitized = sanitized.substring(0, sanitized.length - 5) + ".jpg";
    }
    return sanitized;
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

      const sanitizedName = sanitizeFilename(image.name);
      const base64 = await fileToBase64(image);
      const uploadRes = await fetch(API_UPLOAD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: sanitizedName, file: base64 }),
      });

      if (!uploadRes.ok) throw new Error("Image upload failed");

      const imageKey = sanitizedName;
      setLastUploadedKey(imageKey);

      setStatus("Generating audio (waiting for AWS processing)...");

      // Wait 5 seconds initially
      await new Promise((res) => setTimeout(res, 5000));

      fetchAudioUrl(imageKey, 0);
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Unexpected error");
    }
  };

  const fetchAudioUrl = async (imageKey, currentRetry = 0) => {
    try {
      const response = await fetch(
        `${API_GET_AUDIO_URL}?image_key=${encodeURIComponent(imageKey)}`
      );
      
      // If the Lambda returned 404, it is still generating
      if (response.status === 404) {
        if (currentRetry < 10) {
          setStatus(`Generating audio... (Checking S3, attempt ${currentRetry + 1}/10)`);
          
          // Wait 3 seconds and poll again
          setTimeout(() => {
            fetchAudioUrl(imageKey, currentRetry + 1);
          }, 3000);
        } else {
          setStatus("Audio generation timed out. Please check if S3 trigger is active.");
        }
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server returned status ${response.status}`);
      }

      const url = data.url;
      if (!url) throw new Error("Audio URL not found in server response");

      setAudioUrl(url);
      setDescription(data.description || "No description available.");
      setStatus("Audio loaded 🎧");
      
      // Save scan to history
      saveToHistory(imageKey);
    } catch (err) {
      console.error("Polling check failed:", err);
      setStatus(`Error: ${err.message}`);
    }
  };

  const handleAudioError = () => {
    setStatus("Error playing the audio track. S3 link might have expired.");
  };

  const saveToHistory = (filename) => {
    const newScan = {
      id: Date.now().toString(),
      filename: filename,
      timestamp: new Date().toLocaleString(),
    };

    // Filter out existing duplicates of the same filename in history to keep it clean
    const updatedHistory = [
      newScan,
      ...history.filter((item) => item.filename !== filename),
    ];

    setHistory(updatedHistory);
    localStorage.setItem(
      `scans_${user.email.toLowerCase()}`,
      JSON.stringify(updatedHistory)
    );
  };

  const handlePlayFromHistory = async (filename) => {
    try {
      setStatus(`Loading audio for ${filename}...`);
      setAudioUrl(null);
      setDescription("");
      setLastUploadedKey(filename);

      // Fetch a fresh pre-signed S3 URL for the key
      const response = await fetch(
        `${API_GET_AUDIO_URL}?image_key=${encodeURIComponent(filename)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server returned status ${response.status}`);
      }

      const url = data.url;
      if (!url) throw new Error("Could not retrieve audio URL");

      setAudioUrl(url);
      setDescription(data.description || "No description available.");
      setStatus(`Audio loaded for ${filename} 🎧`);

      // Play audio automatically after state update
      setTimeout(() => {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.play().catch((e) => console.log("Auto-play blocked", e));
        }
      }, 100);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  };

  const handleDeleteFromHistory = (e, id) => {
    e.stopPropagation();
    const updatedHistory = history.filter((item) => item.id !== id);
    setHistory(updatedHistory);
    localStorage.setItem(
      `scans_${user.email.toLowerCase()}`,
      JSON.stringify(updatedHistory)
    );
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="brand-title">
          <span>🎙️</span> VoxReader
        </div>
        <div className="user-controls">
          <span className="user-welcome">
            Welcome, <strong>{user.username}</strong>
          </span>
          <button className="logout-btn" onClick={onLogout}>
            Log Out
          </button>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <div className="workspace-grid">
        {/* Left Column: Upload Panel */}
        <section className="panel">
          <h2>Upload Image</h2>
          <div className="uploader-area">
            {!imagePreviewUrl ? (
              <div className="file-select-container">
                <input
                  type="file"
                  accept=".jpg, .jpeg, .jfif"
                  className="file-select-input"
                  onChange={handleFileChange}
                />
                <div className="file-select-placeholder">
                  <span className="upload-icon">📤</span>
                  <strong>Drag & Drop or Click to Browse</strong>
                  <span>Supports JPEG, PNG, etc.</span>
                </div>
              </div>
            ) : (
              <div className="preview-card">
                <img
                  src={imagePreviewUrl}
                  alt="Upload preview"
                  className="preview-image"
                />
                <button className="remove-image-btn" onClick={handleRemoveImage}>
                  ×
                </button>
              </div>
            )}

            <button
              className="action-btn"
              onClick={handleUpload}
              disabled={
                !image ||
                status.includes("Uploading") ||
                status.includes("Generating")
              }
            >
              {status.includes("Uploading") || status.includes("Generating")
                ? "Processing image..."
                : "Convert Image to Speech"}
            </button>

            {status !== "idle" && (
              <div className="status-display">
                {(status.includes("Uploading") ||
                  status.includes("Generating") ||
                  status.includes("Loading")) && <div className="status-spinner" />}
                <span>{status}</span>
              </div>
            )}

            {audioUrl && (
              <div className="audio-player-card">
                <div className="audio-player-header">Synthesized Audio</div>
                <div className="audio-controls-row">
                  <audio ref={audioPlayerRef} controls src={audioUrl} onError={handleAudioError} />
                </div>
                
                {description && (
                  <div className="description-card">
                    <div className="description-header">👁️ AI Vision Description</div>
                    <p className="description-text">{description}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Scan History */}
        <section className="panel">
          <h2>My Scan History</h2>
          <div className="history-list">
            {history.length === 0 ? (
              <div className="no-scans-placeholder">
                <p>No past scans found.</p>
                <p>Convert an image to populate your library!</p>
              </div>
            ) : (
              history.map((scan) => (
                <div
                  key={scan.id}
                  className="history-item"
                  onClick={() => handlePlayFromHistory(scan.filename)}
                >
                  <div className="history-item-details">
                    <span className="history-item-name" title={scan.filename}>
                      {scan.filename}
                    </span>
                    <span className="history-item-time">{scan.timestamp}</span>
                  </div>
                  <div className="history-actions">
                    <button
                      className="play-history-btn"
                      title="Play scan"
                      onClick={() => handlePlayFromHistory(scan.filename)}
                    >
                      ▶
                    </button>
                    <button
                      className="delete-history-btn"
                      title="Delete scan"
                      onClick={(e) => handleDeleteFromHistory(e, scan.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
