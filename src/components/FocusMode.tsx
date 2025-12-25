import { useState, useEffect, useRef } from "react";
import { X, Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { TextLogo } from "./Logo";

interface FocusModeProps {
  isOpen: boolean;
  onClose: () => void;
}

type AmbientSound = {
  name: string;
  url: string;
  icon: string;
  type: 'web' | 'generated';
};

// Using web-based audio sources and Web Audio API for generated sounds
const AMBIENT_SOUNDS: AmbientSound[] = [
  {
    name: "Rain",
    url: "https://www.soundjay.com/misc/sounds/rain-01.wav",
    icon: "🌧️",
    type: 'web'
  },
  {
    name: "Forest",
    url: "https://www.soundjay.com/nature/sounds/forest-01.wav",
    icon: "🌲",
    type: 'web'
  },
  {
    name: "Ocean",
    url: "https://www.soundjay.com/nature/sounds/ocean-01.wav",
    icon: "🌊",
    type: 'web'
  },
  {
    name: "Brown Noise",
    url: "brown-noise",
    icon: "🤎",
    type: 'generated'
  },
  {
    name: "White Noise",
    url: "white-noise",
    icon: "📻",
    type: 'generated'
  },
  {
    name: "Pink Noise",
    url: "pink-noise",
    icon: "🌸",
    type: 'generated'
  },
];

export function FocusMode({ isOpen, onClose }: FocusModeProps) {
  const { theme } = useTheme();
  const [studyTime, setStudyTime] = useState(25); // Default 25 minutes
  const [breakTime, setBreakTime] = useState(5); // Default 5 minutes
  const [currentTime, setCurrentTime] = useState(studyTime * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [selectedSound, setSelectedSound] = useState<string | null>(null);
  const [soundVolume, setSoundVolume] = useState(0.3);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Timer logic
  useEffect(() => {
    if (isRunning && currentTime > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev <= 1) {
            // Timer finished
            setIsRunning(false);
            playNotificationSound();

            if (isBreak) {
              // Break finished, start new study session
              setIsBreak(false);
              setCurrentTime(studyTime * 60);
            } else {
              // Study session finished
              setCompletedSessions((prev) => prev + 1);
              setIsBreak(true);
              setCurrentTime(breakTime * 60);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, currentTime, isBreak, studyTime, breakTime]);

  // Ambient sound management
  useEffect(() => {
    if (selectedSound && !isMuted) {
      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
      }
      stopGeneratedNoise();

      const selectedSoundData = AMBIENT_SOUNDS.find(sound => sound.url === selectedSound);

      if (selectedSoundData?.type === 'generated') {
        // Handle generated noise
        const noiseType = selectedSound.replace('-noise', '') as 'white' | 'pink' | 'brown';
        playGeneratedNoise(noiseType);
      } else {
        // Handle web audio files with fallback
        audioRef.current = new Audio(selectedSound);
        audioRef.current.loop = true;
        audioRef.current.volume = soundVolume;
        audioRef.current.crossOrigin = "anonymous";

        audioRef.current.play().catch((error) => {
          console.warn("Failed to play web audio, falling back to generated sound:", error);
          // Fallback to white noise if web audio fails
          playGeneratedNoise('white');
        });
      }
    } else {
      // Stop all audio
      if (audioRef.current) {
        audioRef.current.pause();
      }
      stopGeneratedNoise();
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      stopGeneratedNoise();
    };
  }, [selectedSound, isMuted]);

  // Volume control for both web audio and generated sounds
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = soundVolume;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = soundVolume;
    }
  }, [soundVolume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      stopGeneratedNoise();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Generate noise using Web Audio API
  const generateNoise = (type: 'white' | 'pink' | 'brown') => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const audioContext = audioContextRef.current;
    const bufferSize = audioContext.sampleRate * 2; // 2 seconds of audio
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = buffer.getChannelData(0);

    if (type === 'white') {
      // White noise - equal power across all frequencies
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    } else if (type === 'pink') {
      // Pink noise - 1/f noise
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11; // Reduce volume
        b6 = white * 0.115926;
      }
    } else if (type === 'brown') {
      // Brown noise - 1/f² noise
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5; // Amplify
      }
    }

    return buffer;
  };

  const playGeneratedNoise = (type: 'white' | 'pink' | 'brown') => {
    if (!audioContextRef.current) return;

    // Stop any existing noise
    if (noiseNodeRef.current) {
      noiseNodeRef.current.stop();
    }

    const audioContext = audioContextRef.current;
    const buffer = generateNoise(type);

    noiseNodeRef.current = audioContext.createBufferSource();
    noiseNodeRef.current.buffer = buffer;
    noiseNodeRef.current.loop = true;

    // Create gain node for volume control
    if (!gainNodeRef.current) {
      gainNodeRef.current = audioContext.createGain();
      gainNodeRef.current.connect(audioContext.destination);
    }

    gainNodeRef.current.gain.value = soundVolume;
    noiseNodeRef.current.connect(gainNodeRef.current);
    noiseNodeRef.current.start();
  };

  const stopGeneratedNoise = () => {
    if (noiseNodeRef.current) {
      noiseNodeRef.current.stop();
      noiseNodeRef.current = null;
    }
  };

  const playNotificationSound = () => {
    // Create a simple beep using Web Audio API
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const audioContext = audioContextRef.current;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // 800 Hz tone
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStart = () => {
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsBreak(false);
    setCurrentTime(studyTime * 60);
  };

  const handleSoundSelect = (soundUrl: string) => {
    // Initialize audio context on user interaction (required by browsers)
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Resume audio context if suspended (required by some browsers)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    setSelectedSound(selectedSound === soundUrl ? null : soundUrl);
  };

  if (!isOpen) return null;


  return (
    <div className="focus-mode-overlay">
      <div className="focus-mode-container">
        {/* Logo */}
        <div className="focus-mode-logo">
          <TextLogo />
        </div>

        {/* Header */}
        <div className="focus-mode-header">
          <h2 className="focus-mode-title">
            {isBreak ? "Break Time" : "Focus Session"}
          </h2>
          <button
            className="focus-mode-close"
            onClick={onClose}
            title="Exit Focus Mode"
          >
            <X size={20} />
          </button>
        </div>

        {/* Timer Display */}
        <div className="focus-timer-display">
          <div className="timer-circle">
            <div className="timer-text">
              <div className="timer-time">{formatTime(currentTime)}</div>
              <div className="timer-label">
                {isBreak ? "Break" : "Focus"}
              </div>
            </div>
          </div>
        </div>

        {/* Timer Controls */}
        <div className="focus-timer-controls">
          {!isRunning ? (
            <button className="timer-button primary" onClick={handleStart}>
              <Play size={20} />
              Start
            </button>
          ) : (
            <button className="timer-button" onClick={handlePause}>
              <Pause size={20} />
              Pause
            </button>
          )}
          <button className="timer-button" onClick={handleReset}>
            <RotateCcw size={20} />
            Reset
          </button>
        </div>

        {/* Session Settings */}
        <div className="focus-settings">
          <div className="setting-group">
            <label>Study Time (minutes)</label>
            <input
              type="number"
              min="1"
              max="120"
              value={studyTime}
              onChange={(e) => {
                const newTime = parseInt(e.target.value) || 25;
                setStudyTime(newTime);
                if (!isBreak && !isRunning) {
                  setCurrentTime(newTime * 60);
                }
              }}
              disabled={isRunning}
            />
          </div>
          <div className="setting-group">
            <label>Break Time (minutes)</label>
            <input
              type="number"
              min="1"
              max="30"
              value={breakTime}
              onChange={(e) => {
                const newTime = parseInt(e.target.value) || 5;
                setBreakTime(newTime);
                if (isBreak && !isRunning) {
                  setCurrentTime(newTime * 60);
                }
              }}
              disabled={isRunning}
            />
          </div>
        </div>

        {/* Ambient Sounds */}
        <div className="ambient-sounds">
          <div className="ambient-sounds-header">
            <h3>Ambient Sounds</h3>
            <div className="sound-controls">
              <button
                className="sound-toggle"
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={soundVolume}
                onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                className="volume-slider"
                disabled={isMuted}
              />
            </div>
          </div>
          <div className="sound-options">
            {AMBIENT_SOUNDS.map((sound) => (
              <button
                key={sound.name}
                className={`sound-option ${selectedSound === sound.url ? "active" : ""}`}
                onClick={() => handleSoundSelect(sound.url)}
                disabled={isMuted}
                title={sound.type === 'generated' ? `${sound.name} (Generated)` : `${sound.name} (Web Audio)`}
              >
                <span className="sound-icon">{sound.icon}</span>
                <span className="sound-name">{sound.name}</span>
                {sound.type === 'generated' && (
                  <span className="sound-type">Generated</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Progress Stats */}
        <div className="focus-stats">
          <div className="stat-item">
            <div className="stat-number">{completedSessions}</div>
            <div className="stat-label">Sessions Completed</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">{Math.floor(completedSessions * studyTime / 60)}h {(completedSessions * studyTime) % 60}m</div>
            <div className="stat-label">Total Study Time</div>
          </div>
        </div>

        {/* Study Tips */}
        <div className="study-tips">
          <h4>Study Tips</h4>
          <ul>
            <li>Remove distractions from your workspace</li>
            <li>Use ambient sounds to mask distracting noises</li>
            <li>Take notes by hand when possible</li>
            <li>Use the Pomodoro Technique (25min focus + 5min break)</li>
            <li>Stay hydrated and take regular breaks</li>
            <li>Review material before starting each session</li>
          </ul>
          <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <strong>Sound Info:</strong> Generated sounds (Brown/White/Pink Noise) work offline.
            Web sounds may require internet connection.
          </div>
        </div>
      </div>
    </div>
  );
}