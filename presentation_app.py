import cv2
import mediapipe as mp
import numpy as np
from pdf2image import convert_from_path
from PIL import Image, ImageTk
import tkinter as tk
from tkinter import filedialog
import threading
import speech_recognition as sr
import pyttsx3
import time

# ------------------------ Helper Functions ------------------------
def distance(a, b):
    return np.linalg.norm(np.array(a) - np.array(b))

def finger_up(landmarks, tip, pip):
    return landmarks[tip][1] < landmarks[pip][1]

# ------------------------ Gesture Control Class ------------------------
class GestureController:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(max_num_hands=1,
                                         min_detection_confidence=0.7,
                                         min_tracking_confidence=0.7)
        self.mp_draw = mp.solutions.drawing_utils
        self.mode = "Idle"   # Idle, Draw, Highlight, Erase, Laser
        self.mode_locked = False
        self.prev_x, self.prev_y = 0, 0

    def process(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb)
        gesture = "Idle"

        landmarks = None
        if results.multi_hand_landmarks:
            hand_landmarks = results.multi_hand_landmarks[0]
            landmarks = [(int(lm.x * frame.shape[1]), int(lm.y * frame.shape[0])) 
                         for lm in hand_landmarks.landmark]

            # Finger positions
            idx_up = finger_up(landmarks, 8, 6)
            mid_up = finger_up(landmarks, 12, 10)
            ring_up = finger_up(landmarks, 16, 14)
            pinky_up = finger_up(landmarks, 20, 18)
            thumb_up = finger_up(landmarks, 4, 2)

            index_tip = landmarks[8]
            thumb_tip = landmarks[4]

            # ---------------- Mode Selection ----------------
            if all([idx_up, mid_up, ring_up, pinky_up, thumb_up]):
                # Stop gesture
                self.mode_locked = False
                self.mode = "Idle"
                gesture = "Stop"
                self.prev_x, self.prev_y = 0, 0
            elif not self.mode_locked:
                # Select mode
                if idx_up and not mid_up:
                    self.mode = "Draw"
                    self.mode_locked = True
                    gesture = "Draw Mode"
                elif distance(index_tip, thumb_tip) < 40:
                    self.mode = "Highlight"
                    self.mode_locked = True
                    gesture = "Highlight Mode"
                elif not idx_up and not mid_up and not ring_up and not pinky_up:
                    self.mode = "Erase"
                    self.mode_locked = True
                    gesture = "Erase Mode"
                elif idx_up and not mid_up and ring_up and not pinky_up:
                    self.mode = "Laser"
                    self.mode_locked = True
                    gesture = "Laser Mode"

        return landmarks, self.mode, gesture

# ------------------------ Voice Control Class ------------------------
class VoiceController(threading.Thread):
    def __init__(self, app):
        threading.Thread.__init__(self)
        self.app = app
        self.recognizer = sr.Recognizer()
        self.engine = pyttsx3.init()
        self.running = True

    def run(self):
        while self.running:
            with sr.Microphone() as source:
                try:
                    audio = self.recognizer.listen(source, phrase_time_limit=3)
                    command = self.recognizer.recognize_google(audio).lower()
                    self.process_command(command)
                except:
                    pass

    def process_command(self, cmd):
        if "next" in cmd:
            self.app.next_slide()
            self.engine.say("Next slide")
            self.engine.runAndWait()
        elif "previous" in cmd:
            self.app.prev_slide()
            self.engine.say("Previous slide")
            self.engine.runAndWait()
        elif "draw" in cmd:
            self.app.gesture_controller.mode = "Draw"
            self.app.gesture_controller.mode_locked = True
        elif "highlight" in cmd:
            self.app.gesture_controller.mode = "Highlight"
            self.app.gesture_controller.mode_locked = True
        elif "erase" in cmd:
            self.app.gesture_controller.mode = "Erase"
            self.app.gesture_controller.mode_locked = True
        elif "laser" in cmd:
            self.app.gesture_controller.mode = "Laser"
            self.app.gesture_controller.mode_locked = True
        elif "stop" in cmd:
            self.app.gesture_controller.mode = "Idle"
            self.app.gesture_controller.mode_locked = False

# ------------------------ Main App Class ------------------------
class PresentationApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Gesture & Voice Presentation App")
        self.root.geometry("1200x800")

        # Canvas for slides
        self.slide_canvas = tk.Canvas(root, width=1000, height=700, bg='black')
        self.slide_canvas.pack(side=tk.LEFT, padx=10, pady=10)

        # Webcam preview
        self.video_label = tk.Label(root)
        self.video_label.pack(side=tk.RIGHT, padx=10)

        # Slide control variables
        self.slides = []
        self.current_slide = 0
        self.overlay = None

        # Gesture controller
        self.gesture_controller = GestureController()

        # Load PDF Button
        self.load_btn = tk.Button(root, text="Load PDF", command=self.load_pdf)
        self.load_btn.pack(side=tk.TOP, pady=5)

        # Start webcam thread
        self.cap = cv2.VideoCapture(0)
        self.running = True
        self.update_frame()

        # Voice thread
        self.voice_thread = VoiceController(self)
        self.voice_thread.start()

    # ---------------- Slide Functions ----------------
    def load_pdf(self):
        path = filedialog.askopenfilename(filetypes=[("PDF files", "*.pdf")])
        if path:
            self.slides = convert_from_path(path, dpi=150)
            self.current_slide = 0
            self.show_slide()

    def show_slide(self):
        if self.slides:
            img = self.slides[self.current_slide]
            img = img.resize((1000, 700))
            self.tk_slide = ImageTk.PhotoImage(img)
            self.slide_canvas.create_image(0, 0, anchor=tk.NW, image=self.tk_slide)
            # Overlay for drawing/highlighting
            self.overlay = np.zeros((700, 1000, 4), dtype=np.uint8)

    def next_slide(self):
        if self.slides and self.current_slide < len(self.slides) - 1:
            self.current_slide += 1
            self.show_slide()

    def prev_slide(self):
        if self.slides and self.current_slide > 0:
            self.current_slide -= 1
            self.show_slide()

    # ---------------- Webcam & Gesture Loop ----------------
    def update_frame(self):
        if self.running:
            ret, frame = self.cap.read()
            if ret:
                frame = cv2.flip(frame, 1)
                landmarks, mode, gesture = self.gesture_controller.process(frame)

                # Overlay operations
                if landmarks and self.overlay is not None:
                    index_tip = landmarks[8]
                    if mode == "Draw":
                        if self.gesture_controller.prev_x == 0:
                            self.gesture_controller.prev_x, self.gesture_controller.prev_y = index_tip
                        cv2.line(self.overlay, 
                                 (self.gesture_controller.prev_x, self.gesture_controller.prev_y),
                                 (index_tip[0], index_tip[1]),
                                 (0, 0, 0, 255), 5)
                        self.gesture_controller.prev_x, self.gesture_controller.prev_y = index_tip
                    elif mode == "Highlight":
                        cv2.circle(self.overlay, index_tip, 20, (0, 255, 255, 100), -1)
                    elif mode == "Erase":
                        cv2.circle(self.overlay, index_tip, 30, (0, 0, 0, 0), -1)
                    elif mode == "Laser":
                        cv2.circle(self.overlay, index_tip, 15, (0, 0, 255, 255), -1)

                # Show webcam feed
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame_pil = Image.fromarray(frame_rgb)
                frame_pil = frame_pil.resize((250, 180))
                self.tk_frame = ImageTk.PhotoImage(frame_pil)
                self.video_label.config(image=self.tk_frame)

                # Merge overlay on slide
                if self.slides:
                    slide_img = self.slides[self.current_slide].resize((1000, 700))
                    slide_np = np.array(slide_img).astype(np.uint8)
                    if self.overlay is not None:
                        # Merge RGBA overlay
                        alpha = self.overlay[:, :, 3] / 255.0
                        for c in range(3):
                            slide_np[:, :, c] = slide_np[:, :, c] * (1 - alpha) + self.overlay[:, :, c] * alpha
                    slide_display = ImageTk.PhotoImage(Image.fromarray(slide_np))
                    self.slide_canvas.create_image(0, 0, anchor=tk.NW, image=slide_display)
                    self.slide_canvas.image = slide_display

            self.root.after(30, self.update_frame)

    def stop(self):
        self.running = False
        self.cap.release()
        self.voice_thread.running = False

# ------------------------ Run App ------------------------
root = tk.Tk()
app = PresentationApp(root)
root.protocol("WM_DELETE_WINDOW", app.stop)
root.mainloop()
