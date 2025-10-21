import cv2
import mediapipe as mp
import numpy as np

# -------- Mediapipe Setup --------
mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils
hands = mp_hands.Hands(max_num_hands=1,
                       min_detection_confidence=0.7,
                       min_tracking_confidence=0.7)

# -------- Helper Functions --------
def distance(a, b):
    return np.linalg.norm(np.array(a) - np.array(b))

def finger_up(landmarks, tip, pip):
    return landmarks[tip][1] < landmarks[pip][1]

# -------- Canvas Setup --------
canvas = None
draw_color = (0, 0, 0)           # Black
erase_color = (255, 255, 255)    # White
highlight_color = (0, 255, 255)  # Yellow
brush_thickness = 6
erase_thickness = 40
highlight_thickness = 25
highlight_alpha = 0.4            # Transparency for highlight

# -------- State Variables --------
mode = "Idle"
mode_locked = False
active = False
pause = False
prev_x, prev_y = 0, 0

# -------- Video Capture --------
cap = cv2.VideoCapture(0)
cap.set(3, 1280)
cap.set(4, 720)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape

    if canvas is None:
        canvas = np.ones_like(frame) * 255  # White background

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb)

    gesture = "No Gesture"

    if results.multi_hand_landmarks:
        hand_landmarks = results.multi_hand_landmarks[0]
        mp_draw.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
        landmarks = [(int(lm.x * w), int(lm.y * h)) for lm in hand_landmarks.landmark]

        # Finger positions
        index_tip = landmarks[8]
        index_pip = landmarks[6]
        middle_tip = landmarks[12]
        middle_pip = landmarks[10]
        ring_tip = landmarks[16]
        pinky_tip = landmarks[20]
        thumb_tip = landmarks[4]

        # Finger states
        idx_up = finger_up(landmarks, 8, 6)
        mid_up = finger_up(landmarks, 12, 10)
        ring_up = finger_up(landmarks, 16, 14)
        pinky_up = finger_up(landmarks, 20, 18)
        thumb_up = finger_up(landmarks, 4, 2)

        # ----- Gesture Logic -----
        # Full hand open -> STOP all modes (unlock mode)
        if all([idx_up, mid_up, ring_up, pinky_up, thumb_up]):
            mode_locked = False
            active = False
            pause = False
            mode = "Idle"
            gesture = "Stopped (Open Hand)"
            prev_x, prev_y = 0, 0

        # If a mode is locked, continue only that mode
        elif mode_locked:
            if mode == "Draw":
                # Temporary pause with two fingers
                if idx_up and mid_up and not ring_up and not pinky_up:
                    pause = True
                    gesture = "Draw Paused"
                    prev_x, prev_y = 0, 0
                else:
                    pause = False
                    gesture = "Drawing"
                    if not pause:
                        x, y = index_tip
                        if prev_x == 0 and prev_y == 0:
                            prev_x, prev_y = x, y
                        cv2.line(canvas, (prev_x, prev_y), (x, y), draw_color, brush_thickness)
                        prev_x, prev_y = x, y

            elif mode == "Erase":
                x, y = index_tip
                cv2.circle(canvas, (x, y), erase_thickness, erase_color, -1)
                gesture = "Erasing"

            elif mode == "Highlight":
                x, y = index_tip
                temp_canvas = canvas.copy()
                cv2.circle(temp_canvas, (x, y), highlight_thickness, highlight_color, -1)
                cv2.addWeighted(temp_canvas, highlight_alpha, canvas, 1 - highlight_alpha, 0, canvas)
                gesture = "Highlighting"

        # Mode selection when no mode locked
        else:
            if idx_up and not mid_up and not ring_up and not pinky_up:
                mode = "Draw"
                mode_locked = True
                active = True
                pause = False
                x, y = index_tip
                prev_x, prev_y = x, y
                gesture = "Drawing"

            elif not idx_up and not mid_up and not ring_up and not pinky_up:
                mode = "Erase"
                mode_locked = True
                active = True
                x, y = index_tip
                cv2.circle(canvas, (x, y), erase_thickness, erase_color, -1)
                prev_x, prev_y = 0, 0
                gesture = "Erasing"

            elif distance(index_tip, thumb_tip) < 40:
                mode = "Highlight"
                mode_locked = True
                active = True
                x, y = index_tip
                temp_canvas = canvas.copy()
                cv2.circle(temp_canvas, (x, y), highlight_thickness, highlight_color, -1)
                cv2.addWeighted(temp_canvas, highlight_alpha, canvas, 1 - highlight_alpha, 0, canvas)
                prev_x, prev_y = 0, 0
                gesture = "Highlighting"

    else:
        prev_x, prev_y = 0, 0

    # Display merged frame
    combined = cv2.addWeighted(frame, 0.5, canvas, 0.5, 0)

    cv2.putText(combined, f"Mode: {mode}", (10, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 100, 255), 2)
    cv2.putText(combined, f"Gesture: {gesture}", (10, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (50, 255, 50), 2)

    cv2.imshow("Gesture Drawing Board", combined)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
