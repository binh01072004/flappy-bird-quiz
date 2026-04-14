// 1. Cấu hình Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAASe787vps_STYUTcRs4JwxY_aTZ2G0BA",
  authDomain: "flappy-hcm-project.firebaseapp.com",
  projectId: "flappy-hcm-project",
  storageBucket: "flappy-hcm-project.firebasestorage.app",
  messagingSenderId: "730740153117",
  appId: "1:730740153117:web:cfd62bac044228dc315ff4",
  measurementId: "G-6W8S9DZEZW"
};
// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 2. Hàm lưu điểm số
function saveScore(name, score) {
    if(!name) name = "Người chơi ẩn danh";
    
    db.collection("leaderboard").add({
        playerName: name,
        points: score,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => console.log("Đã lưu điểm thành công!"))
    .catch((error) => console.error("Lỗi lưu điểm: ", error));
}

// 3. Hàm lắng nghe bảng xếp hạng Realtime
function getLeaderboard() {
    db.collection("leaderboard")
      .orderBy("points", "desc") // Sắp xếp điểm cao nhất lên đầu
      .limit(5) // Chỉ lấy Top 5
      .onSnapshot((snapshot) => {
          const listElement = document.getElementById('top-players-list');
          listElement.innerHTML = ""; // Xóa danh sách cũ
          
          snapshot.forEach((doc) => {
              const data = doc.data();
              const li = document.createElement("li");
              li.textContent = `${data.playerName}: ${data.points} câu`;
              listElement.appendChild(li);
          });
      });
}

// Gọi hàm lắng nghe ngay khi load game
getLeaderboard();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const startScreen = document.getElementById('start-screen');
const quizScreen = document.getElementById('quiz-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const questionText = document.getElementById('question-text');
const answersContainer = document.getElementById('answers-container');
const finalScoreEl = document.getElementById('final-score');
const godModeToggle = document.getElementById('godModeToggle');

// --- LOGIC CHỌN NHÂN VẬT ---
let currentAvatar = "🤓"; // Mặc định là mặt kính
const avatars = document.querySelectorAll('.avatar');

avatars.forEach(avatar => {
    avatar.addEventListener('click', function() {
        // Xóa viền vàng ở tất cả nhân vật
        avatars.forEach(a => a.classList.remove('selected'));
        // Thêm viền vàng vào nhân vật vừa click
        this.classList.add('selected');
        // Lưu lại emoji để lát vẽ lên màn hình
        currentAvatar = this.getAttribute('data-char');
    });
});

// --- DATA PIPELINE ---
let allQuestions = []; 
let availableQuestions = []; 

// Hàm gọi data từ file JSON
async function fetchQuestions() {
    try {
        const response = await fetch('questions.json');
        if (!response.ok) throw new Error("Không thể đọc được file");
        allQuestions = await response.json();
        resetQuestionPool();
        console.log("Đã tải xong ngân hàng câu hỏi:", allQuestions.length, "câu.");
    } catch (error) {
        console.error("Lỗi Data:", error);
        // Backup: Nếu bị lỗi CORS do không dùng Live Server, game tự nạp câu hỏi này để không bị liệt nút
        allQuestions = [
            { 
                q: "LỖI HỆ THỐNG: Game chưa đọc được file questions.json. Có phải anh quên mở bằng 'Live Server' trên VS Code không?", 
                options: ["À quên, để bật Live Server", "Đang dùng Live Server mà vẫn lỗi"], 
                ans: 0 
            }
        ];
        resetQuestionPool();
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function resetQuestionPool() {
    availableQuestions = [...allQuestions];
    shuffleArray(availableQuestions);
}

// --- GAME VARIABLES ---
let frames = 0;
let isPlaying = false;
let isPausedForQuiz = false;
let score = 0;
let animationId;
let godMode = false;

godModeToggle.addEventListener('change', (e) => {
    godMode = e.target.checked;
});

const bird = {
    x: 50, y: 150, width: 30, height: 30,
    velocity: 0, gravity: 0.15, jump: -4.5,
    draw() {
        if (godMode) {
            // Nếu bật bất tử thì vẽ màu đỏ
            ctx.fillStyle = "#e74c3c";
            ctx.fillRect(this.x, this.y, this.width, this.height);
        } else {
            // Vẽ emoji nhân vật đã chọn
            ctx.font = "35px Arial"; // Chỉnh cỡ chữ to ra chút cho vừa khung hitbox
            ctx.textBaseline = "top"; 
            ctx.fillText(currentAvatar, this.x - 2, this.y - 2); // Căn chỉnh vị trí emoji
        }
    },
    update() {
        this.velocity += this.gravity;
        this.y += this.velocity;
        
        if (this.y + this.height >= canvas.height) { 
            this.y = canvas.height - this.height; 
            if (!godMode) gameOver();
        }
        if (this.y <= 0) { 
            this.y = 0; 
            this.velocity = 0; 
        }
    },
    flap() { this.velocity = this.jump; }
};

const pipes = {
    items: [], width: 50, gap: 180, dx: 1.2,
    draw() {
        ctx.fillStyle = "#2ecc71";
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            ctx.fillRect(p.x, 0, this.width, p.top);
            ctx.fillRect(p.x, p.top + this.gap, this.width, canvas.height - p.top - this.gap);
        }
    },
    update() {
        if (frames % 150 === 0) { 
            let top = Math.random() * (canvas.height - this.gap - 100) + 50;
            this.items.push({ x: canvas.width, top: top, passed: false });
        }
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= this.dx;

            if (bird.x + bird.width > p.x && bird.x < p.x + this.width &&
                (bird.y < p.top || bird.y + bird.height > p.top + this.gap)) {
                if (!godMode) gameOver();
            }

            if (p.x + this.width < bird.x && !p.passed) {
                p.passed = true;
                triggerQuiz();
            }

            if (p.x + this.width < 0) { this.items.shift(); i--; }
        }
    }
};

function drawScore() {
    ctx.fillStyle = "white";
    ctx.font = "30px Impact";
    ctx.fillText("Đã qua: " + score, 130, 50);
}

function triggerQuiz() {
    isPausedForQuiz = true;
    cancelAnimationFrame(animationId);
    
    if (availableQuestions.length === 0) resetQuestionPool();
    const currentQuestion = availableQuestions.pop(); 
    
    questionText.innerText = currentQuestion.q;
    answersContainer.innerHTML = '';
    
    currentQuestion.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.innerText = opt;
        btn.onclick = () => checkAnswer(index, currentQuestion.ans);
        answersContainer.appendChild(btn);
    });

    quizScreen.classList.add('active');
}

function checkAnswer(selectedIndex, correctIndex) {
    quizScreen.classList.remove('active');
    if (selectedIndex === correctIndex || godMode) {
        score++;
        isPausedForQuiz = false;
        gameLoop(); 
    } else {
        gameOver();
    }
}

function gameOver() {
    isPlaying = false;
    cancelAnimationFrame(animationId);
    finalScoreEl.innerText = "Số câu sống sót: " + score;
    gameOverScreen.classList.add('active');

    // --- GỌI HÀM LƯU ĐIỂM KHI GAME OVER ---
    // Lấy tên từ ô input (nếu chưa có ô input thì để mặc định)
    const nameInput = document.getElementById('player-name');
    const playerName = nameInput ? nameInput.value : "Người chơi ẩn danh";
    
    // Nếu chơi lớn được hơn 0 điểm và KHÔNG bật God Mode thì mới lưu xếp hạng
    if (score > 0 && !godMode) {
        saveScore(playerName, score);
    }
}

function resetGame() {
    bird.y = 150;
    bird.velocity = 0;
    pipes.items = [];
    score = 0;
    frames = 0;
    isPlaying = true;
    isPausedForQuiz = false;
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    gameLoop();
}

function gameLoop() {
    if (!isPlaying || isPausedForQuiz) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    bird.draw();
    bird.update();
    pipes.draw();
    pipes.update();
    drawScore();
    
    frames++;
    animationId = requestAnimationFrame(gameLoop);
}

// Controls
document.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'ArrowUp') && isPlaying && !isPausedForQuiz) bird.flap();
});
canvas.addEventListener('mousedown', (e) => {
    // Không cho chim nhảy nếu click trúng nút checkbox admin
    if (e.target.id !== 'godModeToggle' && isPlaying && !isPausedForQuiz) bird.flap();
});

// Gán sự kiện cho 2 nút bấm
document.getElementById('btn-start').addEventListener('click', resetGame);
document.getElementById('btn-restart').addEventListener('click', resetGame);

// Load data lúc mở trang
fetchQuestions();