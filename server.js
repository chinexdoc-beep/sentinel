const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jwt-simple');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'sentinel_super_secret_key_2026';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Sentinel Engine connected to MongoDB Atlas!'))
  .catch((err) => console.error('❌ Database Connection Error:', err.message));

// SCHEMAS
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['citizen', 'authority'], default: 'citizen' },
  agencyName: { type: String, default: '' },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const AUTHORITY_DIRECTORY = {
  'Kidnapping & Abduction Threats': 'anti-kidnapping.unit@police.gov.ng',
  'Armed Robbery & Violent Crime': 'rapidresponse@police.gov.ng',
  'Infrastructure & Roads': 'works.roads@infrastructure.gov.ng',
  'Water & Sewage': 'water.board@infrastructure.gov.ng',
  'Electricity & Power Grid': 'power.grid@utilities.gov.ng',
  'Public Health & Sanitation': 'sanitation@health.gov.ng',
  'Other Urgent Matters': 'dispatch@civic.gov.ng'
};

const reportSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  location: { type: String, required: true },
  latitude: { type: Number, required: true, default: 9.0765 },
  longitude: { type: Number, required: true, default: 7.3986 },
  description: { type: String, required: true },
  image: { type: String, default: '' },
  reportedBy: { type: String, default: 'Anonymous Citizen' },
  assignedAgencyEmail: { type: String },
  upvotes: { type: Number, default: 0 },
  status: { type: String, enum: ['Pending', 'In Progress', 'Resolved'], default: 'Pending' },
  statusUpdatedBy: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Report = mongoose.model('Report', reportSchema);

// -------------------------------------------------------------
// NODEMAILER TRANSPORTER & EMAIL HELPERS
// -------------------------------------------------------------
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  family: 4
});

// 1. WELCOME EMAIL
const sendWelcomeEmail = async (userEmail, userName) => {
  try {
    const mailOptions = {
      from: `"Sentinel Security" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: 'Welcome to Sentinel',
      text: `Hi ${userName},\n\nThank you for signing up for Sentinel! Your account is active.\n\nYou can log in to report civic incidents, track emergency responses, and view updates in real-time.\n\nIf you did not request this account, please ignore this message.\n\nBest regards,\nSentinel Team`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
          <h2 style="color: #0d6efd; margin-bottom: 10px;">Welcome to Sentinel, ${userName}!</h2>
          <p>Your account has been successfully verified on the Civic Action & GIS Dispatch Platform.</p>
          <p>You can now log in, submit incident reports, and monitor emergency dispatches in real-time.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 13px; color: #777;">If you did not create an account on Sentinel, please ignore this email.</p>
          <p>Best regards,<br><strong>The Sentinel Team</strong></p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Welcome email sent to ${userEmail}`);
  } catch (error) {
    console.error('⚠️ Could not send welcome email:', error.message);
  }
};

// 2. PASSWORD RESET EMAIL
const sendPasswordResetEmail = async (userEmail, resetToken) => {
  try {
    const mailOptions = {
      from: `"Sentinel Security" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: 'Password Reset Request - Sentinel',
      text: `Hi,\n\nYou requested a password reset for your Sentinel account. Use the following code to reset your password:\n\nReset Code: ${resetToken}\n\nThis token will expire in 1 hour. If you did not request a password reset, please ignore this email.\n\nBest regards,\nSentinel Security Team`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
          <h2 style="color: #dc3545; margin-bottom: 10px;">Password Reset Request</h2>
          <p>You requested a password reset for your Sentinel account.</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center; font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #0d6efd; margin: 20px 0;">
            ${resetToken}
          </div>
          <p>This code will expire in <strong>1 hour</strong>.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 13px; color: #777;">If you did not request this, please ignore this email and your password will remain unchanged.</p>
          <p>Best regards,<br><strong>The Sentinel Security Team</strong></p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`🔑 Reset token email sent to ${userEmail}`);
  } catch (error) {
    console.error('⚠️ Could not send password reset email:', error.message);
  }
};

// 3. AGENCY INCIDENT DISPATCH EMAIL
const sendAgencyDispatchEmail = async (agencyEmail, report) => {
  try {
    const targetEmail = process.env.EMAIL_USER; // Fallback to verified email for local testing

    const mailOptions = {
      from: `"Sentinel Dispatch Unit" <${process.env.EMAIL_USER}>`,
      to: targetEmail,
      subject: `🚨 [ALERT] New Incident Dispatched: ${report.title}`,
      text: `EMERGENCY DISPATCH ALERT\n\nTitle: ${report.title}\nCategory: ${report.category}\nLocation: ${report.location} (${report.latitude}, ${report.longitude})\nReported By: ${report.reportedBy}\nAssigned Agency: ${agencyEmail}\n\nDescription:\n${report.description}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
          <h2 style="color: #dc3545; margin-bottom: 10px;">🚨 High Priority Incident Dispatched</h2>
          <p>A new civic action report requiring agency attention has been submitted to Sentinel.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr style="background-color: #f8f9fa;"><td style="padding: 10px; font-weight: bold; border: 1px solid #ddd;">Title:</td><td style="padding: 10px; border: 1px solid #ddd;">${report.title}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold; border: 1px solid #ddd;">Category:</td><td style="padding: 10px; border: 1px solid #ddd;">${report.category}</td></tr>
            <tr style="background-color: #f8f9fa;"><td style="padding: 10px; font-weight: bold; border: 1px solid #ddd;">Location:</td><td style="padding: 10px; border: 1px solid #ddd;">${report.location} (${report.latitude}, ${report.longitude})</td></tr>
            <tr><td style="padding: 10px; font-weight: bold; border: 1px solid #ddd;">Reported By:</td><td style="padding: 10px; border: 1px solid #ddd;">${report.reportedBy}</td></tr>
            <tr style="background-color: #f8f9fa;"><td style="padding: 10px; font-weight: bold; border: 1px solid #ddd;">Assigned Unit:</td><td style="padding: 10px; border: 1px solid #ddd;">${agencyEmail}</td></tr>
          </table>
          <p><strong>Incident Description:</strong></p>
          <blockquote style="background-color: #fff3cd; border-left: 4px solid #ffc107; margin: 10px 0; padding: 12px; font-style: italic;">
            ${report.description}
          </blockquote>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 13px; color: #777;">Sentinel Dispatch & Operations Center</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`🚨 Emergency dispatch email sent for report "${report.title}"`);
  } catch (error) {
    console.error('⚠️ Could not send dispatch email:', error.message);
  }
};

// AUTH MIDDLEWARE
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied. Token missing.' });

  try {
    const verified = jwt.decode(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired session token.' });
  }
};

const requireAuthority = (req, res, next) => {
  if (req.user && req.user.role === 'authority') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Authority privileges required.' });
  }
};

// AUTH ROUTES
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, role, agencyName, secretKey } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already registered.' });

    let userRole = 'citizen';
    if (role === 'authority') {
      if (secretKey !== (process.env.AUTHORITY_KEY || 'POLICE-2026')) {
        return res.status(403).json({ error: 'Invalid Authority Passkey.' });
      }
      userRole = 'authority';
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: userRole,
      agencyName: userRole === 'authority' ? agencyName : ''
    });

    await newUser.save();

    // Trigger welcome email in background
    sendWelcomeEmail(newUser.email, newUser.name);

    const token = jwt.encode({ id: newUser._id, name: newUser.name, role: newUser.role, agencyName: newUser.agencyName }, JWT_SECRET);

    res.status(201).json({
      token,
      user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role, agencyName: newUser.agencyName }
    });
  } catch (error) {
    res.status(500).json({ error: 'Signup failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid email or password.' });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Invalid email or password.' });

    const token = jwt.encode({ id: user._id, name: user.name, role: user.role, agencyName: user.agencyName }, JWT_SECRET);

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, agencyName: user.agencyName }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

// PASSWORD RESET ROUTES
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'No user found with that email address.' });
    }

    const token = crypto.randomBytes(4).toString('hex').toUpperCase();
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 Hour
    await user.save();

    sendPasswordResetEmail(user.email, token);

    res.json({
      message: 'Password reset code sent to your email address.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process password reset request.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password updated successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// REPORT ROUTES
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve reports' });
  }
});

app.post('/api/reports', authenticateToken, async (req, res) => {
  try {
    const { title, category, location, latitude, longitude, description, image } = req.body;
    const assignedAgencyEmail = AUTHORITY_DIRECTORY[category] || AUTHORITY_DIRECTORY['Other Urgent Matters'];

    const newReport = new Report({
      title,
      category,
      location,
      latitude: latitude || 9.0765,
      longitude: longitude || 7.3986,
      description,
      image,
      reportedBy: req.user.name,
      assignedAgencyEmail
    });

    await newReport.save();

    // Trigger agency dispatch email in background
    sendAgencyDispatchEmail(assignedAgencyEmail, newReport);

    res.status(201).json({
      success: true,
      message: `Report filed & routed to ${assignedAgencyEmail}`,
      data: newReport
    });
  } catch (error) {
    res.status(400).json({ error: 'Failed to post report.' });
  }
});

app.patch('/api/reports/:id/upvote', authenticateToken, async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { $inc: { upvotes: 1 } },
      { returnDocument: 'after' }
    );
    res.json(report);
  } catch (error) {
    res.status(400).json({ error: 'Failed to upvote.' });
  }
});

app.patch('/api/reports/:id/status', authenticateToken, requireAuthority, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['Pending', 'In Progress', 'Resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const updaterInfo = `${req.user.agencyName || 'Official Force'} (${req.user.name})`;

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status, statusUpdatedBy: updaterInfo },
      { returnDocument: 'after' }
    );
    res.json(report);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update status.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Sentinel Engine online at http://localhost:${PORT}`));