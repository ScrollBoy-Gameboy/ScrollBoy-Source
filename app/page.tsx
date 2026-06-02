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

      const romArrayBuffer = await file.arrayBuffer();
      const romBlob = new Blob([romArrayBuffer]);

      // Use the bundled cores from Nostalgist CDN for compatibility
      const instance = await Nostalgist.launch({
        core: "mgba",
        rom: romBlob,
        canvas: canvasRef.current!,
        runEmulatorManually: false,
      });

      setNostalgist(instance);
      setEmulatorRunning(true);
      setStatusText("");
      setLoading(false);
    } catch (error) {
      console.error("[v0] Error initializing emulator:", error);
      setStatusText("Error loading emulator. Try again.");
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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center select-none p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".gba,.gbc,.gb"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Game Boy Body */}
      <div
        className="relative flex flex-col items-center"
        style={{
          width: "320px",
          height: "520px",
          background: "linear-gradient(180deg, #c8c8c8 0%, #d8d8d8 15%, #e8e8e8 100%)",
          borderRadius: "12px 12px 12px 80px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.5)",
        }}
      >
        {/* Top dark gray section */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{
            height: "50px",
            background: "linear-gradient(180deg, #a0a0a0 0%, #b8b8b8 100%)",
            borderRadius: "12px 12px 0 0",
          }}
        >
          {/* Top decorative lines */}
          <div className="absolute top-[10px] left-[20px] right-[20px] h-[3px] bg-[#888] rounded-full" />
          <div className="absolute top-[18px] left-[20px] right-[20px] h-[3px] bg-[#888] rounded-full" />
        </div>

        {/* Screen Bezel */}
        <div
          className="relative mt-[60px]"
          style={{
            width: "240px",
            height: "190px",
            background: "linear-gradient(145deg, #505060 0%, #404050 50%, #303040 100%)",
            borderRadius: "10px 10px 35px 10px",
            padding: "15px",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          {/* Inner screen area with green tint */}
          <div
            className="relative w-full h-full overflow-hidden flex items-center justify-center"
            style={{
              background: "#8bac0f",
              borderRadius: "4px",
              boxShadow: "inset 0 2px 10px rgba(0,0,0,0.3)",
            }}
          >
            <canvas
              ref={canvasRef}
              className={`w-full h-full object-contain ${emulatorRunning ? "block" : "hidden"}`}
              style={{ imageRendering: "pixelated" }}
            />
            {!emulatorRunning && (
              <button
                onClick={handleLoadClick}
                className="text-[#306230] text-sm font-bold cursor-pointer bg-transparent border-none hover:text-[#0f380f] transition-colors"
              >
                {loading ? "Loading..." : statusText}
              </button>
            )}
          </div>

          {/* Power indicator dot */}
          <div
            className={`absolute top-[20px] right-[-8px] w-[6px] h-[6px] rounded-full transition-all ${
              emulatorRunning
                ? "bg-[#ff0000] shadow-[0_0_6px_#ff0000]"
                : "bg-[#4a0000]"
            }`}
          />
        </div>

        {/* Nintendo-style branding text */}
        <div className="mt-2 text-[#666] text-[10px] font-bold tracking-[3px] italic">
          GAME BOY
        </div>

        {/* Controls Section */}
        <div className="relative w-full flex-1 mt-4">
          {/* D-Pad */}
          <div className="absolute left-[35px] top-[20px]">
            <div className="relative w-[90px] h-[90px]">
              {/* D-Pad Cross Shape */}
              <div
                className="absolute inset-0"
                style={{
                  background: "#2a2a2a",
                  clipPath: "polygon(33% 0%, 67% 0%, 67% 33%, 100% 33%, 100% 67%, 67% 67%, 67% 100%, 33% 100%, 33% 67%, 0% 67%, 0% 33%, 33% 33%)",
                  boxShadow: "2px 2px 4px rgba(0,0,0,0.4)",
                }}
              />
              
              {/* Up button */}
              <button
                type="button"
                className={`absolute top-0 left-1/2 -translate-x-1/2 w-[30px] h-[30px] bg-transparent border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                  pressedButtons.has("UP") ? "brightness-75" : ""
                }`}
                {...createButtonHandlers("UP")}
              />
              
              {/* Down button */}
              <button
                type="button"
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[30px] h-[30px] bg-transparent border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                  pressedButtons.has("DOWN") ? "brightness-75" : ""
                }`}
                {...createButtonHandlers("DOWN")}
              />
              
              {/* Left button */}
              <button
                type="button"
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-[30px] h-[30px] bg-transparent border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                  pressedButtons.has("LEFT") ? "brightness-75" : ""
                }`}
                {...createButtonHandlers("LEFT")}
              />
              
              {/* Right button */}
              <button
                type="button"
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-[30px] h-[30px] bg-transparent border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                  pressedButtons.has("RIGHT") ? "brightness-75" : ""
                }`}
                {...createButtonHandlers("RIGHT")}
              />
            </div>
          </div>

          {/* A/B Buttons - Diagonal arrangement like real Game Boy */}
          <div className="absolute right-[25px] top-[15px]">
            <div className="relative w-[100px] h-[80px]">
              {/* B Button (left, lower) */}
              <button
                type="button"
                className={`absolute left-0 bottom-0 w-[45px] h-[45px] rounded-full border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                  pressedButtons.has("B") ? "scale-95 brightness-75" : ""
                }`}
                style={{
                  background: "linear-gradient(145deg, #c71585 0%, #a01060 100%)",
                  boxShadow: pressedButtons.has("B")
                    ? "1px 1px 2px rgba(0,0,0,0.4), inset 0 1px 2px rgba(0,0,0,0.3)"
                    : "2px 3px 6px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.2)",
                }}
                {...createButtonHandlers("B")}
              >
                <span className="text-[10px] font-bold text-[#600030] opacity-60">B</span>
              </button>

              {/* A Button (right, higher) */}
              <button
                type="button"
                className={`absolute right-0 top-0 w-[45px] h-[45px] rounded-full border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                  pressedButtons.has("A") ? "scale-95 brightness-75" : ""
                }`}
                style={{
                  background: "linear-gradient(145deg, #c71585 0%, #a01060 100%)",
                  boxShadow: pressedButtons.has("A")
                    ? "1px 1px 2px rgba(0,0,0,0.4), inset 0 1px 2px rgba(0,0,0,0.3)"
                    : "2px 3px 6px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.2)",
                }}
                {...createButtonHandlers("A")}
              >
                <span className="text-[10px] font-bold text-[#600030] opacity-60">A</span>
              </button>
            </div>
            
            {/* Button labels */}
            <div className="flex justify-between mt-1 px-[5px]">
              <span className="text-[8px] font-bold text-[#4682b4]">B</span>
              <span className="text-[8px] font-bold text-[#4682b4]">A</span>
            </div>
          </div>

          {/* Start/Select Buttons - angled like real Game Boy */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-[70px] flex gap-[20px]"
            style={{ transform: "translateX(-50%) rotate(-25deg)" }}
          >
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                className={`w-[40px] h-[10px] rounded-[5px] border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                  pressedButtons.has("SELECT") ? "scale-95 brightness-75" : ""
                }`}
                style={{
                  background: "linear-gradient(180deg, #707070 0%, #505050 100%)",
                  boxShadow: "1px 2px 3px rgba(0,0,0,0.4)",
                }}
                {...createButtonHandlers("SELECT")}
              />
              <span className="text-[7px] font-bold text-[#555]" style={{ transform: "rotate(25deg)" }}>
                SELECT
              </span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                className={`w-[40px] h-[10px] rounded-[5px] border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${
                  pressedButtons.has("START") ? "scale-95 brightness-75" : ""
                }`}
                style={{
                  background: "linear-gradient(180deg, #707070 0%, #505050 100%)",
                  boxShadow: "1px 2px 3px rgba(0,0,0,0.4)",
                }}
                {...createButtonHandlers("START")}
              />
              <span className="text-[7px] font-bold text-[#555]" style={{ transform: "rotate(25deg)" }}>
                START
              </span>
            </div>
          </div>

          {/* Speaker Grille */}
          <div className="absolute right-[30px] bottom-[30px] flex flex-col gap-[4px]" style={{ transform: "rotate(-25deg)" }}>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="w-[35px] h-[4px] rounded-full"
                style={{
                  background: "linear-gradient(180deg, #999 0%, #bbb 50%, #999 100%)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Load ROM button - outside the Game Boy */}
      <button
        onClick={handleLoadClick}
        className="mt-6 px-6 py-2 bg-[#333] border border-[#555] rounded text-white text-sm font-bold cursor-pointer transition-all hover:bg-[#222] active:bg-[#111]"
      >
        Load ROM
      </button>

      {/* Keyboard controls hint */}
      <div className="fixed bottom-[10px] left-1/2 -translate-x-1/2 text-[#444] text-[10px] text-center">
        Arrow Keys = D-Pad | Z = A | X = B | Enter = Start | Shift = Select
      </div>
    </div>
  );
}
