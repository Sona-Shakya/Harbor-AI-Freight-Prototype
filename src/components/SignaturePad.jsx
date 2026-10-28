import React, { useRef, useState, useEffect } from 'react';

/**
 * Self-contained HTML5 Canvas digital signature pad (zero external dependencies)
 * Supports mouse & touch input with touch scroll prevention and high DPI rendering.
 */
export default function SignaturePad({
  onChange = () => {},
  onClear = () => {},
  width = 460,
  height = 160,
  disabled = false,
}) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPointRef = useRef({ x: 0, y: 0 });

  // Setup canvas high-DPI scaling
  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;

    // Use current bounding client width if parent is smaller than width
    const rect = canvas.getBoundingClientRect();
    const targetWidth = rect.width > 0 ? rect.width : width;

    canvas.width = targetWidth * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${targetWidth}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0f172a'; // dark slate
  };

  useEffect(() => {
    setupCanvas();
    const handleResize = () => {
      // only resize if not drawn yet to prevent clearing user work
      if (!hasDrawn) setupCanvas();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [width, height, hasDrawn]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if (e.touches && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    if (disabled) return;
    const coords = getCoordinates(e);
    lastPointRef.current = coords;
    setIsDrawing(true);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  };

  const draw = (e) => {
    if (!isDrawing || disabled) return;
    // prevent page scrolling while drawing on mobile touch devices
    if (e.type === 'touchmove' && e.cancelable) {
      e.preventDefault();
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const coords = getCoordinates(e);

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    lastPointRef.current = coords;
    if (!hasDrawn) {
      setHasDrawn(true);
    }
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      const dataUrl = canvas.toDataURL('image/png');
      onChange(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    setHasDrawn(false);
    onClear();
    onChange('');
  };

  return (
    <div className="sig-pad-wrapper">
      <div
        className={`sig-pad-canvas-container ${hasDrawn ? 'has-content' : ''} ${disabled ? 'disabled' : ''}`}
        style={{ position: 'relative', width: '100%', height: `${height}px` }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
          style={{
            display: 'block',
            width: '100%',
            height: `${height}px`,
            background: '#ffffff',
            borderRadius: '6px',
            touchAction: 'none',
            cursor: disabled ? 'not-allowed' : 'crosshair',
          }}
          aria-label="Digital signature drawing canvas"
        />

        {/* Signature baseline indicator */}
        <div className="sig-pad-baseline" pointerEvents="none">
          <span className="sig-pad-x">✕</span>
          <div className="sig-pad-line" />
          <span className="sig-pad-label">Sign above line</span>
        </div>
      </div>

      <div className="sig-pad-actions">
        <button
          type="button"
          className="btn small"
          onClick={handleClear}
          disabled={!hasDrawn || disabled}
          aria-label="Clear signature"
        >
          Clear Signature
        </button>
        <span className="sig-pad-status">
          {hasDrawn ? '✓ Signature captured' : 'Draw with finger or mouse'}
        </span>
      </div>
    </div>
  );
}

