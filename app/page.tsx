"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// GBA button mappings for libretro
const GBA_BUTTONS = {
  A: 8,
  B: 0,
  START: 3,
  SELECT: 2,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
  L: 10,
  R: 11,
};

// Keyboard mappings
const KEY_MAPPINGS: Record<string, keyof typeof GBA_BUTTONS> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  KeyZ: "A",
  KeyX: "B",
  Enter: "START",
  ShiftLeft: "SELECT",
  ShiftRight: "SELECT",
  KeyA: "L",
  KeyS: "R",
};

export default function GBAEmulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [emulatorRunning, setEmulatorRunning] = useState(false);
  const [nostalgist, setNostalgist] = useState<any>(null);
  const [pressedButtons, setPressedButtons] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("Load a ROM to start");

  const pressButton = useCallback(
    (buttonName: keyof typeof GBA_BUTTONS) => {
      if (!emulatorRunning || !nostalgist) return;

      const buttonIndex = GBA_BUTTONS[buttonName];
      if (buttonIndex !== undefined) {
        nostalgist.pressDown(0, buttonIndex);
        setPressedButtons((prev) => new Set(prev).add(buttonName));
      }
    },
    [emulatorRunning, nostalgist]
  );

  const releaseButton = useCallback(
    (buttonName: keyof typeof GBA_BUTTONS) => {
      if (!nostalgist) return;

      const buttonIndex = GBA_BUTTONS[buttonName];
      if (buttonIndex !== undefined) {
        nostalgist.pressUp(0, buttonIndex);
        setPressedButtons((prev) => {
          const newSet = new Set(prev);
          newSet.delete(buttonName);
          return newSet;
        });
      }
    },
    [nostalgist]
  );

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const buttonName = KEY_MAPPINGS[e.code];
      if (buttonName && !pressedButtons.has(buttonName)) {
        e.preventDefault();
        pressButton(buttonName);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const buttonName = KEY_MAPPINGS[e.code];
      if (buttonName) {
        e.preventDefault();
        releaseButton(buttonName);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [pressButton, releaseButton, pressedButtons]);

  const loadEmulator = async (file: File) => {
    try {
      setLoading(true);
      setStatusText("Loading emulator...");

      const { Nostalgist } = await import("nostalgist");

      if (nostalgist) {
        nostalgist.exit();
        setNostalgist(null);
      }

      const romUrl = URL.createObjectURL(file);

      const instance = await Nostalgist.launch({
        core: "mgba",
        rom: romUrl,
        canvas: canvasRef.current!,
        runEmulatorManually: false,
        resolveCoreJs: (core: string) =>
          `https://cdn.jsdelivr.net/gh/nicholasalx/pwa-nicogba/nicogba/libretro-cores/${core}_libretro.js`,
        resolveCoreWasm: (core: string) =>
          `https://cdn.jsdelivr.net/gh/nicholasalx/pwa-nicogba/nicogba/libretro-cores/${core}_libretro.wasm`,
      });

      setNostalgist(instance);
      setEmulatorRunning(true);
      setLoading(false);

      URL.revokeObjectURL(romUrl);
    } catch (error) {
      console.error("Error initializing emulator:", error);
      setStatusText("Error loading emulator");
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadEmulator(file);
    }
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const createButtonHandlers = (buttonName: keyof typeof GBA_BUTTONS) => ({
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
      pressButton(buttonName);
    },
    onMouseUp: (e: React.MouseEvent) => {
      e.preventDefault();
      releaseButton(buttonName);
    },
    onMouseLeave: () => {
      if (pressedButtons.has(buttonName)) {
        releaseButton(buttonName);
      }
    },
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      pressButton(buttonName);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      releaseButton(buttonName);
    },
  });

  return (
    <div className="min-h-screen bg-[#2a2a2a] flex flex-col items-center justify-center select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept=".gba,.gbc,.gb"
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        onClick={handleLoadClick}
        className="absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2 bg-gradient-to-b from-[#6a5a9a] to-[#5a4a8a] border-none rounded-md text-white text-xs font-bold cursor-pointer shadow-md hover:brightness-110 hover:-translate-y-0.5 transition-all z-50"
      >
        Load ROM
      </button>

      <div className="relative w-[850px] h-[500px]">
        {/* Left wing */}
        <div
          className="absolute left-[-60px] top-1/2 -translate-y-1/2 w-[100px] h-[280px] rounded-l-[50px]"
          style={{
            background:
              "linear-gradient(145deg, #5a4a8a 0%, #4a3a7a 50%, #3a2a6a 100%)",
            boxShadow:
              "-5px 5px 15px rgba(0, 0, 0, 0.4), inset 2px 0 5px rgba(255, 255, 255, 0.1)",
          }}
        />

        {/* Right wing */}
        <div
          className="absolute right-[-60px] top-1/2 -translate-y-1/2 w-[100px] h-[280px] rounded-r-[50px]"
          style={{
            background:
              "linear-gradient(145deg, #5a4a8a 0%, #4a3a7a 50%, #3a2a6a 100%)",
            boxShadow:
              "5px 5px 15px rgba(0, 0, 0, 0.4), inset -2px 0 5px rgba(255, 255, 255, 0.1)",
          }}
        />

        {/* Main body */}
        <div
          className="relative w-full h-full flex flex-col items-center pt-[30px]"
          style={{
            background:
              "linear-gradient(145deg, #5a4a8a 0%, #4a3a7a 50%, #3a2a6a 100%)",
            borderRadius: "30px 30px 180px 180px / 30px 30px 80px 80px",
            boxShadow:
              "0 10px 30px rgba(0, 0, 0, 0.5), inset 0 2px 10px rgba(255, 255, 255, 0.1), inset 0 -5px 20px rgba(0, 0, 0, 0.3)",
          }}
        >
          {/* Shoulder L Button */}
          <button
            type="button"
            className={`absolute top-[5px] left-[80px] w-[80px] h-[25px] rounded-t-md flex justify-center items-center text-[#6a6a8a] text-xs font-bold cursor-pointer transition-all border-none ${
              pressedButtons.has("L") ? "translate-y-0.5 brightness-90" : ""
            }`}
            style={{
              background: "linear-gradient(180deg, #4a3a7a 0%, #3a2a6a 100%)",
              boxShadow:
                "0 -3px 6px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.1)",
            }}
            {...createButtonHandlers("L")}
          >
            L
          </button>

          {/* Shoulder R Button */}
          <button
            type="button"
            className={`absolute top-[5px] right-[80px] w-[80px] h-[25px] rounded-t-md flex justify-center items-center text-[#6a6a8a] text-xs font-bold cursor-pointer transition-all border-none ${
              pressedButtons.has("R") ? "translate-y-0.5 brightness-90" : ""
            }`}
            style={{
              background: "linear-gradient(180deg, #4a3a7a 0%, #3a2a6a 100%)",
              boxShadow:
                "0 -3px 6px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.1)",
            }}
            {...createButtonHandlers("R")}
          >
            R
          </button>

          {/* Power Indicator */}
          <div className="absolute top-5 right-[30px] flex items-center gap-2 z-10">
            <div
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                emulatorRunning
                  ? "bg-[#00ff00] shadow-[0_0_10px_#00ff00,0_0_20px_#00ff00]"
                  : "bg-[#1a3a1a]"
              }`}
            />
            <span className="text-[#1a1a3a] text-xs font-bold tracking-wider">
              POWER
            </span>
          </div>

          {/* Screen Bezel */}
          <div
            className="relative w-[420px] h-[280px] rounded-[15px] p-[15px]"
            style={{
              background: "linear-gradient(180deg, #2a2a4a 0%, #1a1a2a 100%)",
              boxShadow:
                "inset 0 3px 15px rgba(0, 0, 0, 0.8), 0 2px 5px rgba(255, 255, 255, 0.1)",
            }}
          >
            <div className="relative w-full h-full bg-[#1a1a1a] rounded-[5px] overflow-hidden flex justify-center items-center">
              <canvas
                ref={canvasRef}
                className={`w-full h-full object-contain ${
                  emulatorRunning ? "block" : "hidden"
                }`}
                style={{ imageRendering: "pixelated" }}
              />
              {!emulatorRunning && (
                <div className="text-[#333] text-sm text-center">
                  {loading ? "Loading..." : statusText}
                </div>
              )}
            </div>
          </div>

          {/* D-Pad */}
          <div className="absolute left-[40px] top-1/2 -translate-y-1/2 w-[120px] h-[120px]">
            <div className="relative w-full h-full">
              {/* D-Pad Center */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-[#3a3a5a] rounded-[5px] z-[2]" />

              {/* D-Pad Up */}
              <button
                type="button"
                className={`absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-t-lg flex justify-center items-center cursor-pointer transition-all border-none ${
                  pressedButtons.has("UP") ? "scale-95 brightness-75" : ""
                }`}
                style={{
                  background:
                    "linear-gradient(145deg, #4a4a6a 0%, #3a3a5a 100%)",
                }}
                {...createButtonHandlers("UP")}
              >
                <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-b-[8px] border-transparent border-b-[#2a2a4a]" />
              </button>

              {/* D-Pad Down */}
              <button
                type="button"
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-b-lg flex justify-center items-center cursor-pointer transition-all border-none ${
                  pressedButtons.has("DOWN") ? "scale-95 brightness-75" : ""
                }`}
                style={{
                  background:
                    "linear-gradient(145deg, #4a4a6a 0%, #3a3a5a 100%)",
                }}
                {...createButtonHandlers("DOWN")}
              >
                <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-transparent border-t-[#2a2a4a]" />
              </button>

              {/* D-Pad Left */}
              <button
                type="button"
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-l-lg flex justify-center items-center cursor-pointer transition-all border-none ${
                  pressedButtons.has("LEFT") ? "scale-95 brightness-75" : ""
                }`}
                style={{
                  background:
                    "linear-gradient(145deg, #4a4a6a 0%, #3a3a5a 100%)",
                }}
                {...createButtonHandlers("LEFT")}
              >
                <div className="w-0 h-0 border-t-[8px] border-b-[8px] border-r-[8px] border-transparent border-r-[#2a2a4a]" />
              </button>

              {/* D-Pad Right */}
              <button
                type="button"
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-r-lg flex justify-center items-center cursor-pointer transition-all border-none ${
                  pressedButtons.has("RIGHT") ? "scale-95 brightness-75" : ""
                }`}
                style={{
                  background:
                    "linear-gradient(145deg, #4a4a6a 0%, #3a3a5a 100%)",
                }}
                {...createButtonHandlers("RIGHT")}
              >
                <div className="w-0 h-0 border-t-[8px] border-b-[8px] border-l-[8px] border-transparent border-l-[#2a2a4a]" />
              </button>
            </div>
          </div>

          {/* A/B Buttons */}
          <div className="absolute right-[40px] top-[45%] -translate-y-1/2 flex gap-[15px]">
            {/* B Button */}
            <button
              type="button"
              className={`w-[50px] h-[50px] rounded-full flex justify-center items-center text-lg font-bold text-[#4a4a6a] cursor-pointer transition-all mt-[30px] border-none ${
                pressedButtons.has("B") ? "scale-95" : ""
              }`}
              style={{
                background:
                  "linear-gradient(145deg, #c8c8d8 0%, #a8a8b8 100%)",
                boxShadow: pressedButtons.has("B")
                  ? "0 2px 4px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.2)"
                  : "0 4px 8px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.5)",
              }}
              {...createButtonHandlers("B")}
            >
              B
            </button>

            {/* A Button */}
            <button
              type="button"
              className={`w-[50px] h-[50px] rounded-full flex justify-center items-center text-lg font-bold text-[#4a4a6a] cursor-pointer transition-all border-none ${
                pressedButtons.has("A") ? "scale-95" : ""
              }`}
              style={{
                background:
                  "linear-gradient(145deg, #c8c8d8 0%, #a8a8b8 100%)",
                boxShadow: pressedButtons.has("A")
                  ? "0 2px 4px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.2)"
                  : "0 4px 8px rgba(0, 0, 0, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.5)",
              }}
              {...createButtonHandlers("A")}
            >
              A
            </button>
          </div>

          {/* Start/Select Buttons */}
          <div className="absolute left-[100px] bottom-[80px] flex flex-col gap-[10px]">
            {/* Start */}
            <div className="flex items-center gap-2">
              <span className="text-[#3a3a5a] text-[10px] font-bold tracking-wider w-[50px]">
                START
              </span>
              <button
                type="button"
                className={`w-[45px] h-[14px] rounded-[7px] cursor-pointer transition-all border-none ${
                  pressedButtons.has("START") ? "scale-95 brightness-90" : ""
                }`}
                style={{
                  background:
                    "linear-gradient(145deg, #7a7a9a 0%, #5a5a7a 100%)",
                  boxShadow:
                    "0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.3)",
                }}
                {...createButtonHandlers("START")}
              />
            </div>

            {/* Select */}
            <div className="flex items-center gap-2">
              <span className="text-[#3a3a5a] text-[10px] font-bold tracking-wider w-[50px]">
                SELECT
              </span>
              <button
                type="button"
                className={`w-[45px] h-[14px] rounded-[7px] cursor-pointer transition-all border-none ${
                  pressedButtons.has("SELECT") ? "scale-95 brightness-90" : ""
                }`}
                style={{
                  background:
                    "linear-gradient(145deg, #7a7a9a 0%, #5a5a7a 100%)",
                  boxShadow:
                    "0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.3)",
                }}
                {...createButtonHandlers("SELECT")}
              />
            </div>
          </div>

          {/* Speaker Grille */}
          <div className="absolute right-[80px] bottom-[70px] flex flex-col gap-[6px]">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-[60px] h-[3px] bg-[#3a3a5a] rounded-sm"
              />
            ))}
          </div>

          {/* Branding */}
          <div className="absolute bottom-[35px] left-1/2 -translate-x-1/2 flex gap-5 items-baseline">
            <span className="text-[#2a2a4a] text-[22px] font-bold italic tracking-wider">
              MGBA
            </span>
            <span className="text-[#2a2a4a] text-[16px] font-bold tracking-[4px]">
              ADVANCE
            </span>
          </div>
        </div>
      </div>

      <div className="fixed bottom-[10px] left-1/2 -translate-x-1/2 text-[#666] text-[11px] text-center">
        Keyboard: Arrow Keys = D-Pad | Z = A | X = B | Enter = Start | Shift =
        Select | A = L | S = R
      </div>
    </div>
  );
}
