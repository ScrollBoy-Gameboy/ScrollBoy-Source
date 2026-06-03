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
  const screenWrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [emulatorRunning, setEmulatorRunning] = useState(false);
  const [nostalgist, setNostalgist] = useState<any>(null);
  const [pressedButtons, setPressedButtons] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("Load Morrowind 0.7.0");

  const pressButton = useCallback(
    (buttonName: keyof typeof GBA_BUTTONS) => {
      if (!emulatorRunning || !nostalgist) return;
      nostalgist.pressDown(buttonName.toLowerCase());
      setPressedButtons((prev) => new Set(prev).add(buttonName.toLowerCase()));
    },
    [emulatorRunning, nostalgist]
  );

  const releaseButton = useCallback(
    (buttonName: keyof typeof GBA_BUTTONS) => {
      if (!nostalgist) return;

      nostalgist.pressUp(buttonName.toLowerCase());
      setPressedButtons((prev) => {
        const newSet = new Set(prev);
        newSet.delete(buttonName.toLowerCase());
        return newSet;
      });
    },
    [nostalgist]
  );

  // Contain and style the Nostalgist-created canvas within our wrapper
  // Applies sizing constraints and the Game Boy green filter
  useEffect(() => {
    if (!emulatorRunning) return;

    const wrapper = screenWrapperRef.current;
    if (!wrapper) return;

    // Find the canvas that Nostalgist created inside the wrapper
    const findAndStyleCanvas = () => {
      const canvas = wrapper.querySelector("canvas");
      if (!canvas) return;

      // Apply monochrome → green palette filter
      canvas.style.filter = "grayscale(1)";
      canvas.style.mixBlendMode = "overlay";
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "contain";
      canvas.style.imageRendering = "pixelated";
    };

    // Initial style application
    findAndStyleCanvas();

    // Watch for canvas being added/modified
    const observer = new MutationObserver(findAndStyleCanvas);
    observer.observe(wrapper, { childList: true, subtree: true });

    // Also enforce on resize
    const ro = new ResizeObserver(findAndStyleCanvas);
    ro.observe(wrapper);

    return () => {
      observer.disconnect();
      ro.disconnect();
    };
  }, [emulatorRunning]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const buttonName = KEY_MAPPINGS[e.code];
      if (buttonName && !pressedButtons.has(buttonName.toLowerCase())) {
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
  
  const startMorrowind = async (version: string) => {
    try {
      setLoading(true);
      setStatusText("Loading Morrowind...");

      const { Nostalgist } = await import("nostalgist");

      if (nostalgist) {
        nostalgist.exit();
        setNostalgist(null);
      }

      const wrapper = screenWrapperRef.current;
      if (!wrapper) {
        throw new Error("Screen wrapper not found");
      }

      // Clear any existing canvas elements
      const existingCanvases = wrapper.querySelectorAll("canvas");
      existingCanvases.forEach((c) => c.remove());

      // Create a new canvas element and append it to the wrapper
      const canvas = document.createElement("canvas");
      canvas.id = "emulator-canvas";
      wrapper.appendChild(canvas);

      // Launch nostalgist with the canvas element directly
      // Uses default CDN-hosted cores for reliability
      const instance = await Nostalgist.launch({
        element: canvas,
        core: "gambatte",
        rom: [version],
        runEmulatorManually: false,
        size: {
          width: 160,
          height: 144,
        },

        resolveRom(vers) {
          return `/roms/morrowind-${vers}.gbc`
        },

        resolveCoreJs(core) {
          return `/cores/${core}_libretro.js`
        },

        resolveCoreWasm(core) {
          return `/cores/${core}_libretro.wasm`
        },
      });

      setNostalgist(instance);
      setEmulatorRunning(true);
      setStatusText("");
      setLoading(false);
    } catch (error) {
      console.error("[v0] Error initializing emulator:", error);
      setStatusText("Error loading Morrowind. Try again.");
      setLoading(false);
    }
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
      if (pressedButtons.has(buttonName.toLowerCase())) {
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
    }
  });

  const handleSwitchToggle = () => {
    if (!emulatorRunning) {
      startMorrowind("0.7.0");
    } else {
      if (nostalgist) {
        nostalgist.exit();
        setNostalgist(null);
      }
      setEmulatorRunning(false);
      setStatusText("Load Morrowind 0.7.0");
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center select-none p-4">

      {/* Outer wrapper: console body sits inside; switch is flush on the right edge */}
      <div className="relative flex items-start">

        {/* Game Boy Body */}
        <div
          className="relative flex flex-col items-center"
          style={{
            width: "320px",
            height: "520px",
            background: "linear-gradient(180deg, #E60012 0%, #B3000E 15%, #8A000A 100%)",
            borderRadius: "12px 12px 12px 80px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.2)",
          }}
        >
        {/* Top gray section */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{
            height: "50px",
            background: "transparent",
            borderRadius: "12px 12px 0 0",
          }}
        >
          {/* Top decorative lines */}
          <div
            className="absolute top-[10px] left-[20px] right-[20px] h-[4px] rounded-full"
            style={{
              background: "linear-gradient(180deg, #B3000E 0%, #E60012 50%, #B3000E 100%)",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
            }}
          />
          <div
            className="absolute top-[18px] left-[20px] right-[20px] h-[4px] rounded-full"
            style={{
              background: "linear-gradient(180deg, #B3000E 0%, #E60012 50%, #B3000E 100%)",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
            }}
          />
        </div>

        {/* Screen Bezel */}
        <div
          className="relative mt-[60px]"
          style={{
            width: "227px",
            height: "208px",
            background: "linear-gradient(145deg, #505060 0%, #404050 50%, #303040 100%)",
            borderRadius: "10px 10px 35px 10px",
            padding: "15px",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          {/* Inner screen area — Nostalgist will create canvas here via element option */}
          <div
            ref={screenWrapperRef}
            className="relative w-full h-full overflow-hidden flex items-center justify-center"
            style={{
              background: "#9c9c9c",
              borderRadius: "4px 4px 24px 4px",
              boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            {/* Nostalgist injects canvas here; we style it via the useEffect observer */}
            {!emulatorRunning && (
              <span className="relative z-10 text-[#cccccc] text-[11px] font-bold text-center px-2 pointer-events-none select-none">
                {loading ? "Loading..." : "Flip the switch to start"}
              </span>
            )}
          </div>

          {/* Power indicator dot */}
          <div
            className={`absolute top-[20px] right-[-15px] w-[6px] h-[6px] rounded-full transition-all ${emulatorRunning
                ? "bg-[#ff0000] shadow-[0_0_6px_#ff0000]"
                : "bg-[#4a0000]"
              }`}
          />
        </div>

        {/* Nintendo-style branding text */}
        <div className="mt-2 text-[#6d0009] text-[10px] font-bold tracking-[3px] italic">
          ScrollBoy
        </div>

        {/* Controls Section */}
        <div className="relative w-full flex-1 mt-4">
          {/* D-Pad */}
          <div className="absolute left-[35px] top-[20px]">
            <div className="relative w-[90px] h-[90px]">
              {/* D-Pad Cross Shape Background */}
              <div
                className="absolute inset-0"
                style={{
                  filter: "brightness(0.9)",
                  background: "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)",
                  clipPath: "path('M82.059 29.118 60.882 29.118 60.882 7.941C60.882 5.014 58.516 2.647 55.588 2.647L34.412 2.647C31.484 2.647 29.118 5.014 29.118 7.941L29.118 29.118 7.941 29.118C5.014 29.118 2.647 31.484 2.647 34.412L2.647 55.588C2.647 58.516 5.014 60.882 7.941 60.882L29.118 60.882 29.118 82.059C29.118 84.986 31.484 87.353 34.412 87.353L55.588 87.353C58.516 87.353 60.882 84.986 60.882 82.059L60.882 60.882 82.059 60.882C84.986 60.882 87.353 58.516 87.353 55.588L87.353 34.412C87.353 31.484 84.986 29.118 82.059 29.118L82.059 29.118Z')",
                  boxShadow: "2px 2px 4px rgba(0,0,0,0.4)",
                }}
              />

              {/* Up button */}
              <button
                type="button"
                style={{
                  transform: "translateY(2.647px)",
                }}
                className={`absolute top-0 left-1/2 -translate-x-1/2 w-[32px] h-[27.353px] border-none cursor-pointer transition-all rounded-t-[4px] ${pressedButtons.has("up") ? "bg-[#1a1a1a]" : "bg-transparent hover:bg-[#3a3a3a] active:bg-[#1a1a1a]"
                  }`}
                {...createButtonHandlers("UP")}
              />

              {/* Down button */}
              <button
                type="button"
                style={{
                  transform: "translateY(-2.647px)",
                }}
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[32px] h-[27.353px] border-none cursor-pointer transition-all rounded-b-[4px] ${pressedButtons.has("down") ? "bg-[#1a1a1a]" : "bg-transparent hover:bg-[#3a3a3a] active:bg-[#1a1a1a]"
                  }`}
                {...createButtonHandlers("DOWN")}
              />

              {/* Left button */}
              <button
                type="button"
                style={{
                  transform: "translateX(2.647px)",
                }}
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-[27.353px] h-[32px] border-none cursor-pointer transition-all rounded-l-[4px] ${pressedButtons.has("left") ? "bg-[#1a1a1a]" : "bg-transparent hover:bg-[#3a3a3a] active:bg-[#1a1a1a]"
                  }`}
                {...createButtonHandlers("LEFT")}
              />

              {/* Right button */}
              <button
                type="button"
                style={{
                  transform: "translateX(-2.647px)",
                }}
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-[27.353px] h-[32px] border-none cursor-pointer transition-all rounded-r-[4px] ${pressedButtons.has("right") ? "bg-[#1a1a1a]" : "bg-transparent hover:bg-[#3a3a3a] active:bg-[#1a1a1a]"
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
                className={`absolute left-0 bottom-0 w-[45px] h-[45px] rounded-full border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${pressedButtons.has("b") ? "scale-95 brightness-75" : ""
                  }`}
                style={{
                  color: "rgba(0, 0, 0, 0.35)",
                  fontWeight: "bolder",
                  background: "linear-gradient(145deg, #c71585 0%, #a01060 100%)",
                  boxShadow: pressedButtons.has("b")
                    ? "1px 1px 2px rgba(0,0,0,0.4), inset 0 1px 2px rgba(0,0,0,0.3)"
                    : "2px 3px 6px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.2)",
                }}
                {...createButtonHandlers("B")}
              >B</button>

              {/* A Button (right, higher) */}
              <button
                type="button"
                className={`absolute right-0 top-0 w-[45px] h-[45px] rounded-full border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${pressedButtons.has("a") ? "scale-95 brightness-75" : ""
                  }`}
                style={{
                  color: "rgba(0, 0, 0, 0.35)",
                  fontWeight: "bolder",
                  background: "linear-gradient(145deg, #c71585 0%, #a01060 100%)",
                  boxShadow: pressedButtons.has("a")
                    ? "1px 1px 2px rgba(0,0,0,0.4), inset 0 1px 2px rgba(0,0,0,0.3)"
                    : "2px 3px 6px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.2)",
                }}
                {...createButtonHandlers("A")}
              >A</button>
            </div>
          </div>

          {/* Start/Select Buttons - centered, no rotation */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[30px] flex gap-[30px]">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                className={`w-[45px] h-[12px] rounded-[6px] border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${pressedButtons.has("select") ? "scale-95 brightness-75" : ""
                  }`}
                style={{
                  background: "linear-gradient(180deg, #707070 0%, #505050 100%)",
                  boxShadow: "1px 2px 3px rgba(0,0,0,0.4)",
                }}
                {...createButtonHandlers("SELECT")}
              />
              <span className="text-[8px] font-bold text-[#440006] tracking-wider">
                SELECT
              </span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                className={`w-[45px] h-[12px] rounded-[6px] border-none cursor-pointer transition-all hover:brightness-90 active:brightness-75 ${pressedButtons.has("start") ? "scale-95 brightness-75" : ""
                  }`}
                style={{
                  background: "linear-gradient(180deg, #707070 0%, #505050 100%)",
                  boxShadow: "1px 2px 3px rgba(0,0,0,0.4)",
                }}
                {...createButtonHandlers("START")}
              />
              <span className="text-[8px] font-bold text-[#440006] tracking-wider">
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
                  background: "linear-gradient(180deg, #6d0009ff 0%, #8f000c 50%, #B3000E 100%)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3)",
                }}
              />
            ))}
          </div>
        </div>
        </div>{/* End Game Boy Body */}

        {/* Side Power Switch — flush against the right edge of the console body */}
        <div
          style={{
            alignSelf: "flex-start",
            marginTop: "90px",
            marginLeft: "0px",
            position: "relative",
          }}
        >
          {/*
            Attachment nub: a thin strip that visually merges the switch
            housing into the console's right edge.
          */}
          <div
            style={{
              position: "absolute",
              left: "0",
              top: "8px",
              bottom: "8px",
              width: "5px",
              background: "linear-gradient(180deg, #444 0%, #2a2a2a 50%, #444 100%)",
              borderRadius: "0 0 0 0",
              zIndex: 0,
            }}
          />

          {/* Switch housing / track */}
          <div
            onClick={handleSwitchToggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleSwitchToggle(); }}
            aria-label={emulatorRunning ? "Power switch ON — click to turn off" : "Power switch OFF — click to turn on"}
            title={emulatorRunning ? "ON — click to stop" : "OFF — click to start"}
            style={{
              position: "relative",
              marginLeft: "4px",
              width: "20px",
              height: "56px",
              background: "linear-gradient(180deg, #3a3a3a 0%, #282828 50%, #3a3a3a 100%)",
              borderRadius: "0 6px 6px 0",
              boxShadow: "3px 0 8px rgba(0,0,0,0.55), 1px 0 3px rgba(0,0,0,0.3), inset -1px 0 2px rgba(255,255,255,0.06), inset 1px 0 2px rgba(0,0,0,0.4)",
              cursor: "pointer",
              zIndex: 1,
              outline: "none",
            }}
          >
            {/* Recessed center groove */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "5px",
                bottom: "5px",
                width: "4px",
                transform: "translateX(-50%)",
                background: "#191919",
                borderRadius: "2px",
                boxShadow: "inset 0 1px 4px rgba(0,0,0,0.8)",
              }}
            />

            {/* Sliding knob — up = ON, down = OFF */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                top: emulatorRunning ? "4px" : "28px",
                transition: "top 0.16s cubic-bezier(0.4, 0, 0.2, 1)",
                width: "14px",
                height: "22px",
                background: "linear-gradient(180deg, #aaaaaa 0%, #787878 35%, #505050 100%)",
                borderRadius: "3px",
                boxShadow: "0 2px 5px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.3)",
                zIndex: 2,
              }}
            >
              {/* Grip ridges */}
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: "2px",
                    right: "2px",
                    height: "1px",
                    top: `${6 + i * 4}px`,
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "1px",
                  }}
                />
              ))}
              {[0, 1, 2].map((i) => (
                <div
                  key={`hi-${i}`}
                  style={{
                    position: "absolute",
                    left: "2px",
                    right: "2px",
                    height: "1px",
                    top: `${7 + i * 4}px`,
                    background: "rgba(255,255,255,0.12)",
                    borderRadius: "1px",
                  }}
                />
              ))}
            </div>

            {/* ON label (top) */}
            <span
              style={{
                position: "absolute",
                top: "2px",
                left: 0,
                right: 0,
                textAlign: "center",
                fontSize: "5px",
                fontWeight: "700",
                letterSpacing: "0.03em",
                color: emulatorRunning ? "rgba(220,220,220,0.85)" : "rgba(100,100,100,0.6)",
                transition: "color 0.2s",
                userSelect: "none",
                pointerEvents: "none",
                lineHeight: 1,
              }}
            >
              ON
            </span>

            {/* OFF label (bottom) */}
            <span
              style={{
                position: "absolute",
                bottom: "2px",
                left: 0,
                right: 0,
                textAlign: "center",
                fontSize: "5px",
                fontWeight: "700",
                letterSpacing: "0.03em",
                color: emulatorRunning ? "rgba(100,100,100,0.6)" : "rgba(220,220,220,0.85)",
                transition: "color 0.2s",
                userSelect: "none",
                pointerEvents: "none",
                lineHeight: 1,
              }}
            >
              OFF
            </span>
          </div>
        </div>

      </div>{/* end outer wrapper */}

      {/* Keyboard controls hint */}
      <div className="fixed bottom-[10px] left-1/2 -translate-x-1/2 text-[#444] text-[10px] text-center">
        Arrow Keys = D-Pad | Z = A | X = B | Enter = Start | Shift = Select
      </div>
    </div>
  );
}
