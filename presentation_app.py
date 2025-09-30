import cv2
import mediapipe as mp
import numpy as np
from collections import deque
from threading import Thread

# --------- CONFIGURATION ---------
SWIPE_HISTORY_LEN = 8        # number of frames for swipe detection
SWIPE_THRESHOLD = 60         # pixels moved to detect swipe
HOLD_FRAMES = 4              # frames to confirm a gesture
# --------------------------------

# --------- Threaded Webcam Capture ---------
class WebcamStream:
    def __init__(self, src=0, width=640, height=480):
        self.cap = cv2.VideoCapture(src)
        self.cap.set(3, width)
        self.cap.set(4, height)
        self.ret, self.frame = self.cap.read()
        self.stopped = False
        Thread(target=self.update, args=()).start()

    def update(self):
        while not self.stopped:
            self.ret, self.frame = self.cap.read()

    def read(self):
        return self.ret, self.frame

    def stop(self):
        self.stopped = True
        self.cap.release()

# --------- Mediapipe Hands Setup ---------
mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils
hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7, min_tracking_confidence=0.7)

# --------- Gesture Detection Helpers ---------
def distance(a, b):
    return np.linalg.norm(np.array(a) - np.array(b))

def finger_up(landmarks, tip, pip):
    return landmarks[tip][1] < landmarks[pip][1]

# --------- Gesture History ---------
swipe_history = deque(maxlen=SWIPE_HISTORY_LEN)
gesture_history = deque(maxlen=HOLD_FRAMES)

# --------- Start Webcam ---------
stream = WebcamStream(0)

while True:
    ret, frame = stream.read()
    if not ret:
        continue

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb)

    gesture = "No Gesture"

    if results.multi_hand_landmarks:
        hand_landmarks = results.multi_hand_landmarks[0]
        mp_draw.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

        landmarks = [(int(lm.x * w), int(lm.y * h)) for lm in hand_landmarks.landmark]

        index_tip = landmarks[8]
        index_pip = landmarks[6]
        middle_tip = landmarks[12]
        middle_pip = landmarks[10]
        ring_tip = landmarks[16]
        pinky_tip = landmarks[20]
        thumb_tip = landmarks[4]
        wrist = landmarks[0]
        middle_mcp = landmarks[9]

        # ------- Finger states -------
        idx_up = finger_up(landmarks, 8, 6)
        mid_up = finger_up(landmarks, 12, 10)
        ring_up = finger_up(landmarks, 16, 14)
        pinky_up = finger_up(landmarks, 20, 18)
        thumb_up = finger_up(landmarks, 4, 2)

        # ------- Gesture Detection Priority -------
        candidate = None

        # Compute hand width as scale reference
        hand_width = distance(wrist, middle_mcp)

        # --- Zoom In / Out (All fingertips close or spread) ---
        tips = [index_tip, middle_tip, ring_tip, pinky_tip, thumb_tip]
        all_close = all(distance(tips[i], tips[j]) < hand_width * 0.25 for i in range(5) for j in range(i+1,5))
        all_apart = all(distance(tips[i], tips[j]) > hand_width * 0.5 for i in range(5) for j in range(i+1,5))
        if all_close:
            candidate = "Zoom In"
        elif all_apart:
            candidate = "Zoom Out"
        # --- Fist (Erase) ---
        elif not idx_up and not mid_up and not ring_up and not pinky_up:
            candidate = "Fist (Erase)"
        # --- Pinch (Highlight) ---
        elif distance(index_tip, thumb_tip) < 40:
            candidate = "Pinch (Highlight)"
        # --- Point (Draw) ---
        elif idx_up and not mid_up and not ring_up and not pinky_up:
            candidate = "Point (Draw)"
        # --- Swipe Left / Right (Index + Middle up) ---
        elif idx_up and mid_up and not ring_up and not pinky_up:
            avg_x = (index_tip[0] + middle_tip[0]) // 2
            swipe_history.append(avg_x)
            if len(swipe_history) >= SWIPE_HISTORY_LEN:
                dx = swipe_history[-1] - swipe_history[0]
                if dx > SWIPE_THRESHOLD:
                    candidate = "Swipe Right"
                    swipe_history.clear()
                elif dx < -SWIPE_THRESHOLD:
                    candidate = "Swipe Left"
                    swipe_history.clear()
        else:
            swipe_history.clear()

        # --- Debouncing: confirm gesture after HOLD_FRAMES ---
        if candidate:
            gesture_history.append(candidate)
            counts = {g: gesture_history.count(g) for g in set(gesture_history)}
            gesture = max(counts, key=counts.get)
        else:
            gesture_history.append("No Gesture")
            gesture = max(set(gesture_history), key=gesture_history.count)

    # Display Gesture
    cv2.putText(frame, f"Gesture: {gesture}", (10,50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,0), 2)
    cv2.imshow("Presentation Gesture Control", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

stream.stop()
cv2.destroyAllWindows()
