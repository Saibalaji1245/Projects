const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors'); 
const multer = require('multer'); 
const { spawn } = require('child_process'); 
const path = require('path'); 
const fs = require('fs'); 
const app = express();
app.use(express.json()); 
app.use(cors()); 
app.use(express.static(__dirname));
console.log(`Serving static files from: ${__dirname}`);
const resultsDir = path.join(__dirname, 'results');
fs.mkdirSync(resultsDir, { recursive: true }); 
app.use('/api/results', express.static(resultsDir));

const demoDir = path.join(__dirname, 'demo');
fs.mkdirSync(demoDir, { recursive: true }); 
app.use('/api/demo', express.static(demoDir));
console.log(`Serving demo files from: ${demoDir}`);
console.log(`Serving result files from: ${resultsDir}`);
mongoose.connect('mongodb://127.0.0.1:27017/assistiveVisionDB')
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  language: { type: String, required: true, default: 'en' }, 
});
const User = mongoose.model('User', UserSchema);
const HistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    job_id: { type: String, required: true },
    originalName: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});
const History = mongoose.model('History', HistorySchema);
const JWT_SECRET = 'your-super-secret-key-that-should-be-in-a-config-file';
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true }); 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (ex) {
        // differentiate expired vs invalid for better client messaging
        if (ex.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired. Please login again.' });
        }
        return res.status(401).json({ message: 'Invalid token.' });
    }
}
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, language } = req.body; 
    if (!username || !password || !language) {
        return res.status(400).json({ message: 'Username, password, and language are required.' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists.' });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newUser = new User({ username, passwordHash, language });
    await newUser.save();
    
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration.' });
  }
});
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }
    const token = jwt.sign(
      { 
        userId: user._id, 
        username: user.username,
        language: user.language 
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.status(200).json({ message: 'Login successful!', token });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login.' });
  }
});
app.post('/api/upload', [authMiddleware, upload.single('video')], (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No video file uploaded.' });
    }
    const videoPath = req.file.path;
    const pythonScriptPath = path.join(__dirname, 'process_video.py');
    const userLanguage = req.user.language || 'en'; 
    if (!fs.existsSync(pythonScriptPath)) {
        console.error('Python script not found at:', pythonScriptPath);
        return res.status(500).json({ message: 'Server configuration error: Python script not found.' });
    }
    console.log(`Running Python script: python ${pythonScriptPath} ${videoPath} ${userLanguage}`);
    const pythonProcess = spawn('python', [pythonScriptPath, videoPath, userLanguage]); 
    let scriptOutput = "";
    let scriptError = "";
    pythonProcess.stdout.on('data', (data) => {
        scriptOutput += data.toString();
        console.log(`Python stdout: ${data.toString()}`);
    });
    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
        scriptError += data.toString();
    });
    pythonProcess.on('close', async (code) => {
        console.log(`Python script exited with code ${code}`);
        fs.unlink(videoPath, (err) => {
            if (err) console.error("Failed to delete uploaded temp file:", err);
        });
        if (code !== 0) {
            console.error('Python script error:', scriptError);
            return res.status(500).json({ message: 'Error processing video.', error: scriptError });
        }
        try {
            const jsonOutput = scriptOutput.substring(scriptOutput.indexOf('{'));
            const result = JSON.parse(jsonOutput);
            if (result.status === 'error') {
                return res.status(500).json({ message: result.message });
            }
            const historyEntry = new History({
                userId: req.user.userId, // Get user ID from token
                job_id: result.job_id,
                originalName: req.file.originalname,
            });
            await historyEntry.save();
            res.status(200).json({ 
                status: 'success', 
                message: 'Video processed successfully.', 
                job_id: result.job_id,
            });
        } catch (e) {
            console.error('Error parsing Python output:', e);
            console.error('Raw Python output:', scriptOutput);
            return res.status(500).json({ message: 'Error parsing processing results.' });
        }
    });
});
app.get('/api/history', authMiddleware, async (req, res) => {
    try {
        const historyItems = await History.find({ userId: req.user.userId })
                                           .sort({ timestamp: -1 });
        res.status(200).json(historyItems);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Server error fetching history.' });
    }
});
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

