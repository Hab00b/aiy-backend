const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || 'aiy_secret_key_2026';

// Middleware kiểm tra Token JWT
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Không tìm thấy Token xác thực' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
        req.user = user;
        next();
    });
}

// Middleware kiểm tra quyền Admin
async function verifyAdmin(req, res, next) {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT email, is_admin FROM users WHERE id = ?', [req.user.id]);
        connection.release();

        if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        
        const isAdmin = rows[0].email === 'trinhquang1986@gmail.com' || rows[0].is_admin === 1;
        if (!isAdmin) {
            return res.status(403).json({ error: 'Bạn không có quyền truy cập khu vực quản trị' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Lỗi kiểm tra quyền hạn' });
    }
}

// API Đăng nhập / Định danh OAuth
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, name, avatar, provider } = req.body;
        if (!email) return res.status(400).json({ error: 'Thiếu thông tin email' });

        const connection = await pool.getConnection();
        let [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
        let user;

        if (rows.length === 0) {
            const [result] = await connection.execute(
                'INSERT INTO users (email, name, avatar, provider, credits) VALUES (?, ?, ?, ?, ?)',
                [email, name, avatar, provider, 50]
            );
            user = { id: result.insertId, email, name, avatar, credits: 50 };
        } else {
            user = rows[0];
        }
        connection.release();

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        const isAdmin = user.email === 'trinhquang1986@gmail.com' || user.is_admin === 1;

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                credits: user.credits,
                is_admin: isAdmin
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi server nội bộ' });
    }
});

// API Lấy thông tin tài khoản
app.get('/api/user/profile', verifyToken, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT id, name, email, avatar, credits, is_admin FROM users WHERE id = ?', [req.user.id]);
        connection.release();

        if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        
        const user = rows[0];
        user.is_admin = (user.email === 'trinhquang1986@gmail.com' || user.is_admin === 1);

        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi truy vấn dữ liệu' });
    }
});

// API Tạo ảnh AI
app.post('/api/ai/generate', verifyToken, async (req, res) => {
    const { 
        prompt, 
        negativePrompt, 
        model, 
        cfgScale, 
        steps, 
        seed, 
        aspectRatio, 
        imageUrl: refImage 
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Thiếu nội dung câu lệnh (prompt)' });

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [userRows] = await connection.execute('SELECT credits FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
        if (userRows[0].credits < 1) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Tài khoản không đủ credit để kết xuất ảnh' });
        }

        // Định nghĩa dữ liệu đầu vào cho Replicate API
        const replicateInput = {
            prompt: prompt,
            negative_prompt: negativePrompt || '',
            cfg_scale: cfgScale || 7.5,
            num_inference_steps: steps || 40,
            aspect_ratio: aspectRatio || '1:1',
            ...(seed && seed !== -1 && { seed: seed }),
            ...(refImage && { image: refImage })
        };

        // Gọi Replicate API để tạo ảnh thực tế
        const replicateResponse = await axios.post(
            'https://api.replicate.com/v1/predictions',
            {
                version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
                input: replicateInput
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'wait'
                },
                timeout: 60000
            }
        );

        const prediction = replicateResponse.data;
        let imageUrl = '';

        if (prediction.status === 'succeeded' && prediction.output) {
            imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        } else {
            await connection.rollback();
            connection.release();
            return res.status(500).json({ error: 'Hệ thống AI không thể trả về hình ảnh, vui lòng thử lại' });
        }

        // Trừ 1 credit trong database và lưu lịch sử
        await connection.execute('UPDATE users SET credits = credits - 1 WHERE id = ?', [req.user.id]);
        await connection.execute(
            'INSERT INTO generations (user_id, prompt, image_url) VALUES (?, ?, ?)',
            [req.user.id, prompt, imageUrl]
        );

        await connection.commit();
        connection.release();

        res.json({ 
            success: true, 
            imageUrl: imageUrl, 
            remainingCredits: userRows[0].credits - 1 
        });

    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Lỗi hệ thống AI:', error.response?.data || error.message);
        res.status(500).json({ error: 'Lỗi kết nối đến động cơ AI' });
    }
});

// ==================== CÁC API QUẢN TRỊ ADMIN ====================

// Lấy thống kê hệ thống
app.get('/api/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [userCount] = await connection.execute('SELECT COUNT(*) as total FROM users');
        const [genCount] = await connection.execute('SELECT COUNT(*) as total FROM generations');
        const [creditSum] = await connection.execute('SELECT SUM(credits) as total FROM users');
        connection.release();

        res.json({
            success: true,
            stats: {
                totalUsers: userCount[0].total,
                totalGenerations: genCount[0].total,
                totalCredits: creditSum[0].total || 0
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi lấy thống kê admin' });
    }
});

// Lấy danh sách toàn bộ người dùng
app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [users] = await connection.execute('SELECT id, name, email, credits, created_at FROM users ORDER BY id DESC');
        connection.release();

        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi lấy danh sách người dùng' });
    }
});

// Cộng/trừ credit cho người dùng thủ công
app.post('/api/admin/adjust-credits', verifyToken, verifyAdmin, async (req, res) => {
    const { userId, credits } = req.body;
    if (!userId || credits === undefined) {
        return res.status(400).json({ error: 'Thiếu thông tin yêu cầu' });
    }

    try {
        const connection = await pool.getConnection();
        await connection.execute('UPDATE users SET credits = credits + ? WHERE id = ?', [parseInt(credits), userId]);
        connection.release();

        res.json({ success: true, message: 'Cập nhật credit thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi cập nhật credit' });
    }
});

// 1. API Lấy lịch sử tạo ảnh của người dùng
app.get('/api/user/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [rows] = await pool.query(
            'SELECT id, prompt, image_url as imageUrl, created_at FROM generations WHERE user_id = ? ORDER BY id DESC', 
            [userId]
        );

        res.json({
            success: true,
            history: rows
        });
    } catch (err) {
        console.error('Lỗi lấy lịch sử:', err);
        res.status(500).json({ success: false, error: 'Không thể tải lịch sử từ database' });
    }
});

// 2. API Xóa bản ghi lịch sử theo ID 
app.delete('/api/user/history/:id', verifyToken, async (req, res) => {
    try {
        const historyId = req.params.id;
        const userId = req.user.id;

        const [result] = await pool.query(
            'DELETE FROM generations WHERE id = ? AND user_id = ?',
            [historyId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy bản ghi hoặc không có quyền xóa' });
        }

        res.json({ success: true, message: 'Đã xóa thành công' });
    } catch (err) {
        console.error('Lỗi xóa lịch sử:', err);
        res.status(500).json({ success: false, error: 'Lỗi server' });
    }
});

// ==================== CÁC API BẢNG TIN CỘNG ĐỒNG ====================

// 1. Lấy danh sách bảng tin cộng đồng
app.get('/api/community/feed', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, user_id, author, prompt, image_url as imageUrl, likes, created_at FROM community ORDER BY id DESC'
        );
        res.json({
            success: true,
            feed: rows
        });
    } catch (err) {
        console.error('Lỗi lấy bảng tin cộng đồng:', err);
        res.status(500).json({ success: false, error: 'Không thể tải bảng tin cộng đồng' });
    }
});

// 2. Thả tim (Like) bài viết cộng đồng
app.post('/api/community/like', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, error: 'Thiếu ID bài viết' });
        }

        await pool.query('UPDATE community SET likes = likes + 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Lỗi thích bài viết:', err);
        res.status(500).json({ success: false, error: 'Lỗi server' });
    }
});

// 3. Chia sẻ ảnh lên bảng tin cộng đồng (Cần đăng nhập)
app.post('/api/community/share', verifyToken, async (req, res) => {
    try {
        const { imageUrl, prompt } = req.body;
        const userId = req.user.id;

        if (!imageUrl || !prompt) {
            return res.status(400).json({ success: false, error: 'Thiếu thông tin ảnh hoặc prompt' });
        }

        const [userRows] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
        const author = userRows.length > 0 ? userRows[0].name : 'Thành viên AIY';

        await pool.query(
            'INSERT INTO community (user_id, author, prompt, image_url, likes) VALUES (?, ?, ?, ?, 0)',
            [userId, author, prompt, imageUrl]
        );

        res.json({ success: true, message: 'Đã chia sẻ lên cộng đồng thành công' });
    } catch (err) {
        console.error('Lỗi chia sẻ cộng đồng:', err);
        res.status(500).json({ success: false, error: 'Lỗi server' });
    }
});

// Khởi động server (đặt ở cuối file để đăng ký toàn bộ routes)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 AIY Backend Server đang chạy tại cổng ${PORT}`);
});
