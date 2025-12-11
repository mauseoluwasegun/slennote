import { useState, useRef, forwardRef, useImperativeHandle, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onStartRecording?: () => void;
  onProcessingStart?: () => void;
  geminiApiKey?: string;
  preferredEngine?: "auto" | "webSpeech" | "gemini";
}

export interface VoiceInputRef {
  startRecording: () => void;
  stopRecording: () => void;
}

export const VoiceInput = forwardRef<VoiceInputRef, VoiceInputProps>(
  ({ onTranscript, onError, onStartRecording, onProcessingStart, geminiApiKey, preferredEngine = "auto" }, ref) => {
    const [isRecording, setIsRecording] = useState(false);
    const [volume, setVolume] = useState(0);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const silenceStartRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const accumulatedTranscriptRef = useRef<string>("");
    const audioChunksRef = useRef<Blob[]>([]);
    const chunkIntervalRef = useRef<number | null>(null);
    const recognitionRef = useRef<any>(null);
    const engineRef = useRef<"webSpeech" | "gemini" | null>(null);

    const transcribeAudio = useAction(api.ai.transcribeAudio);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        stopRecordingCleanup();
      };
    }, []);

    const playSound = (type: 'start' | 'stop') => {
      try {
        const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'start') {
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        } else {
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        }
      } catch (e) {
        console.error('Error playing sound:', e);
      }
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove data URL prefix (e.g., "data:audio/webm;base64,")
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    const processAudioChunk = async () => {
      if (audioChunksRef.current.length === 0) {
        console.log("⚠️ No audio chunks to process");
        return;
      }

      console.log(`🎵 Processing ${audioChunksRef.current.length} audio chunks`);

      try {
        onProcessingStart?.();
        // Combine all chunks into one blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = []; // Clear chunks

        console.log(`📦 Audio blob size: ${audioBlob.size} bytes`);

        // Convert to base64
        const base64Audio = await blobToBase64(audioBlob);
        console.log(`📤 Sending audio to Gemini API (${base64Audio.length} chars)`);

        // Call Gemini API via Convex
        const result = await transcribeAudio({
          audioData: base64Audio,
          apiKey: geminiApiKey as string,
        });

        console.log(`✅ Received transcript: "${result.transcript}"`);

        if (result.transcript) {
          // Append to accumulated transcript
          const needsSpace = accumulatedTranscriptRef.current.length > 0 &&
            !accumulatedTranscriptRef.current.endsWith(" ");
          accumulatedTranscriptRef.current += (needsSpace ? " " : "") + result.transcript;

          console.log(`📝 Accumulated transcript: "${accumulatedTranscriptRef.current}"`);

          // Send update to parent
          onTranscript(accumulatedTranscriptRef.current.trim(), false);
        }
      } catch (error) {
        console.error("❌ Error processing audio chunk:", error);
        onError?.(error instanceof Error ? error.message : "Transcription failed");
      }
    };

    const stopRecordingCleanup = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.log("⚠️ Error stopping media recorder:", e);
        }
      }
      mediaRecorderRef.current = null;

      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
        chunkIntervalRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setIsRecording(false);
      setVolume(0);
    };

    const startRecording = async () => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const canUseWebSpeech = !!SpeechRecognition;
      const selectWebSpeech = preferredEngine === "webSpeech" || (preferredEngine === "auto" && canUseWebSpeech);

      try {
        if (selectWebSpeech) {
          console.log("🎤 Starting Web Speech API recording...");
          recognitionRef.current = new SpeechRecognition();
          recognitionRef.current.continuous = true;
          recognitionRef.current.interimResults = true;
          recognitionRef.current.lang = "en-US";
          engineRef.current = "webSpeech";

          recognitionRef.current.onresult = (event: any) => {
            console.log("🎤 Web Speech result event:", event.results.length, "results");
            let interim = "";
            let final = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              const confidence = event.results[i][0].confidence;
              console.log(`  Result ${i}: "${transcript}" (final: ${event.results[i].isFinal}, confidence: ${confidence})`);
              if (event.results[i].isFinal) {
                final += transcript;
              } else {
                interim += transcript;
              }
            }
            if (interim) {
              console.log(`📝 Sending interim transcript: "${interim}"`);
              onTranscript(interim, false);
            }
            if (final) {
              console.log(`✅ Sending final transcript: "${final}"`);
              onTranscript(final, true);
            }
          };

          recognitionRef.current.onerror = (e: any) => {
            console.error("❌ Web Speech error:", e.error, e.message);
            // Common errors: 'no-speech', 'audio-capture', 'not-allowed', 'network'
            const errorMessage = e.error === 'no-speech'
              ? "No speech detected. Please try again."
              : e.error === 'audio-capture'
                ? "No microphone found. Please check your audio settings."
                : e.error === 'not-allowed'
                  ? "Microphone access denied. Please allow microphone access."
                  : e.error === 'network'
                    ? "Network error. Please check your connection."
                    : typeof e.message === "string" ? e.message : "Speech recognition error";
            onError?.(errorMessage);
          };

          recognitionRef.current.onstart = () => {
            console.log("✅ Web Speech API started");
            setIsRecording(true);
            playSound('start');
            onStartRecording?.();
          };

          recognitionRef.current.onend = () => {
            console.log("🛑 Web Speech API ended");
            setIsRecording(false);
            playSound('stop');
          };

          recognitionRef.current.onspeechstart = () => {
            console.log("🗣️ Speech detected - user is speaking");
          };

          recognitionRef.current.onspeechend = () => {
            console.log("🤐 Speech ended - user stopped speaking");
          };

          recognitionRef.current.start();
          return;
        }

        if (!geminiApiKey) {
          onError?.("🔑 Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your .env.local file.");
          return;
        }

        console.log("🎤 Starting Gemini API recording...");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        engineRef.current = "gemini";

        // Setup Audio Analysis (Volume visualization)
        const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Setup MediaRecorder for audio capture
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

        console.log(`🎙️ Using MIME type: ${mimeType}`);

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        accumulatedTranscriptRef.current = "";
        audioChunksRef.current = [];

        // Collect audio data
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            console.log(`📥 Audio chunk received: ${event.data.size} bytes`);
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error("❌ MediaRecorder error:", event);
          onError?.("Recording error occurred");
          stopRecording();
        };

        // Start recording
        mediaRecorder.start();
        console.log("✅ MediaRecorder started");

        // Process chunks periodically
        chunkIntervalRef.current = window.setInterval(() => {
          console.log("⏰ Processing audio chunk interval triggered");
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            // Request data from recorder
            mediaRecorderRef.current.requestData();
            // Process after a small delay to ensure data is available
            setTimeout(() => {
              processAudioChunk();
            }, 100);
          }
        }, 2000);

        setIsRecording(true);
        silenceStartRef.current = null;
        playSound('start');
        onStartRecording?.();

        // Volume visualization loop
        const loop = () => {
          if (!analyserRef.current || !streamRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          setVolume(average);

          // Silence detection (auto-stop after 5 seconds of silence)
          if (average < 10) {
            if (silenceStartRef.current === null) {
              silenceStartRef.current = Date.now();
            } else if (Date.now() - silenceStartRef.current > 5000) {
              console.log("🔇 Silence detected, stopping...");
              stopRecording();
              return;
            }
          } else {
            silenceStartRef.current = null;
          }

          animationFrameRef.current = requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);

      } catch (error) {
        console.error("❌ Error starting recording:", error);
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          onError?.("🎤 Microphone access denied. Please allow microphone access in your browser settings.");
        } else {
          onError?.("Could not access microphone. Please check permissions.");
        }
      }
    };

    const stopRecording = async () => {
      console.log("🛑 Stopping recording...");
      playSound('stop');

      if (engineRef.current === "webSpeech" && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch { }
        recognitionRef.current = null;
        setIsRecording(false);
        return;
      }

      // Stop the interval
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
        chunkIntervalRef.current = null;
      }

      // Stop media recorder and get final chunk
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();

        // Wait a bit for final data, then process
        setTimeout(async () => {
          await processAudioChunk();

          // Send final transcript
          const finalText = accumulatedTranscriptRef.current.trim();
          console.log("📤 Final transcript:", finalText);

          if (finalText) {
            onTranscript(finalText, true);
          } else {
            onTranscript("", true);
          }

          // Cleanup
          stopRecordingCleanup();
          accumulatedTranscriptRef.current = "";
        }, 500);
      } else {
        // No recording to process, just cleanup
        stopRecordingCleanup();
        accumulatedTranscriptRef.current = "";
        onTranscript("", true);
      }
    };

    const toggleRecording = () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    };

    useImperativeHandle(ref, () => ({
      startRecording,
      stopRecording,
    }));

    return (
      <button
        className={`voice-input-button ${isRecording ? "recording" : ""}`}
        onClick={toggleRecording}
        title={isRecording ? "Stop recording" : "Start voice input"}
        type="button"
        style={isRecording ? { boxShadow: `0 0 0 ${Math.min(volume / 5, 10)}px rgba(239, 68, 68, 0.4)` } : {}}
      >
        {isRecording ? (
          <MicOff size={18} />
        ) : (
          <Mic size={18} />
        )}
        {isRecording && <span className="recording-pulse" />}
      </button>
    );
  }
);
