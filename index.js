const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2'); 
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cron = require('node-cron');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const validator = require('validator');

dotenv.config();
const port = process.env.PORT || 3000;
const app = express();

const allowedOrigins = [
  'https://maskiadmin-management.com',
  'https://www.maskiadmin-management.com',
  'http://127.0.0.1:5501'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const secretKey = uuidv4();

app.use(
    session({
      secret: secretKey,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 3600000, 
      },
    })
  );


  app.use(bodyParser.json());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const connection =  mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    maxIdle: 0,
    idleTimeout: 60000,
    enableKeepAlive: true,
  });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  
const generateId = () => crypto.randomBytes(6).toString('hex');
const generateVariationId = () => crypto.randomBytes(4).toString('hex');

const generateOrderId = () => {

  const now = Date.now();
  const random = Math.floor(100 + Math.random() * 900); 
  return `INV${now}${random}`;
};

const storage = multer.diskStorage({
   destination: (req, file, cb) => {
     cb(null, path.join(__dirname, 'uploads')); 
   },
   filename: (req, file, cb) => {
     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
     cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
   },
});
const upload = multer({ storage });

const transporter = nodemailer.createTransport({
    host: "smpt.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
    debug: true,
});

app.listen(port, () => {
        console.log(`Server is started at http://localhost:${port}`);
      });
      
      app.get('/', (req, res) => {
    res.send('Welcome to the Admin Management System API');
});

const updateCustomerStatus = () => {
 
  const idleQuery = `
    UPDATE customer c
    LEFT JOIN (
      SELECT customer_id, MAX(created_at) AS last_order
      FROM orders
      GROUP BY customer_id
    ) o ON c.customer_id = o.customer_id
    SET c.customer_status = 'idle'
    WHERE (
      (o.last_order IS NULL AND c.created_at < DATE_SUB(NOW(), INTERVAL 1 MONTH))
      OR
      (o.last_order IS NOT NULL AND o.last_order < DATE_SUB(NOW(), INTERVAL 1 MONTH))
    )
  `;
  logActivity({
    activityType: 'UPDATE_CUSTOMER_STATUS',
    tableName: 'customer',
    description: 'Updating customer status to idle for customers with no orders in the last month',
    performedBy: 'Cron Job',
    performedById: null,
    performedByRole: 'System',
    req: null,
    metadata: {
      query: idleQuery
    }
  })
  connection.query(idleQuery, (err) => {
    if (err) console.error('Cron: Failed to set idle customers:', err.message);

    
    const regularQuery = `
      UPDATE customer c
      JOIN (
        SELECT customer_id, COUNT(*) AS order_count, MAX(created_at) AS last_order
        FROM orders
        GROUP BY customer_id
      ) o ON c.customer_id = o.customer_id
      SET c.customer_status = 'regular'
      WHERE o.order_count > 5 AND o.last_order >= DATE_SUB(NOW(), INTERVAL 1 MONTH)
    `;
    connection.query(regularQuery, (err) => {
      if (err) console.error('Cron: Failed to set regular customers:', err.message);
      logActivity({
        activityType: 'UPDATE_CUSTOMER_STATUS',
        tableName: 'customer',
        description: 'Updating customer status to regular for customers with more than 5 orders in the last month',
        performedBy: 'Cron Job',
        performedById: null,
        performedByRole: 'System',
        req: null,
        metadata: {
          query: regularQuery
        }
      })
    });
  });
};


updateCustomerStatus();

cron.schedule('0 2 * * *', updateCustomerStatus);




function logActivity({
  activityType,
  tableName,
  recordId,
  description,
  performedBy = 'System',
  performedById = null,
  performedByRole = 'System',
  significance = 'low',
  req = null,
  metadata = null 
}) {
  const id = generateId();
  
 
  const ipAddress = req?.ip || req?.connection?.remoteAddress || null;
  const userAgent = req?.headers?.['user-agent'] || null;

  const query = `
    INSERT INTO activity_logs (
      id, 
      activity_type, 
      table_name, 
      record_id, 
      description, 
      performed_by, 
      performed_by_id, 
      performed_by_role,
      ip_address,
      significance,
      user_agent,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    id,
    activityType,
    tableName,
    recordId,
    description,
    performedBy,
    performedById,
    performedByRole,
    ipAddress,
    userAgent,
    significance,
    metadata ? JSON.stringify(metadata) : null
  ];

  connection.query(query, values, (err) => {
    if (err) {
      console.error('Error logging activity:', err);
      console.error(`Failed to log activity: ${activityType} on ${tableName || 'N/A'} by ${performedBy} (${performedById})`);
      console.error(`Error details: ${err.message}`);
    } else {
      console.log(`Activity logged: ${activityType} on ${tableName || 'N/A'} by ${performedBy} (${performedById})`);
    
    }
  });
}


  app.get('/recent_activity/:activityId', (req, res) => {
    const { activityId } = req.params;
  
    const query = 'SELECT * FROM activity_logs WHERE id = ?';
  
    connection.query(query, [activityId], (err, results) => {
      if (err) {
        console.error('Error fetching recent activity:', err);
        return res.status(500).json({ error: 'Failed to fetch recent activity' });
      }
  
      if (results.length === 0) {
        return res.status(404).json({ error: 'Recent activity not found' });
      }
  
      res.status(200).json(results[0]);
    });
  });

  app.delete('/recent_activity/:activityId', (req, res) => {
    const { activityId } = req.params;
    const query = 'DELETE FROM activity_logs WHERE id = ?';
  
    connection.query(query, [activityId], (err, result) => {
      if (err) {
        console.error('Error deleting recent activity:', err);
        return res.status(500).json({ error: 'Failed to delete recent activity' });
      }
  
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Recent activity not found' });
      }
  
      res.status(200).json({ message: 'Recent activity deleted successfully' });
    });
  })

  app.get('/recent_activity', (req, res) => {
    const { month, year } = req.query;
  
    let query = 'SELECT * FROM activity_logs';
    const filters = [];
  
    if (month) {
      filters.push(`MONTH(created_at) = ${mysql.escape(month)}`);
    }
    if (year) {
      filters.push(`YEAR(created_at) = ${mysql.escape(year)}`);
    }
  
    if (filters.length > 0) {
      query += ` WHERE ${filters.join(' AND ')}`;
    }
  
    query += ' ORDER BY created_at DESC';
  
    connection.query(query, (err, results) => {
      if (err) {
        console.error('Error fetching recent activities:', err);
        return res.status(500).json({ error: 'Failed to fetch recent activities' });
      }
  
      res.status(200).json(results);
    });
  });


  app.post('/register', async (req, res) => {
  const { first_name, last_name, email, phone_number, password, confirmPassword } = req.body;

  
  if (password !== confirmPassword) {
     logActivity({
      activityType: 'VALIDATION_FAIL',
      description: 'Password mismatch during registration attempt',
      req,
      metadata: { email }
    });
    return res.status(400).json({ message: 'Passwords do not match' });
  }
  if (!first_name || !last_name || !email || !phone_number || !password) {
    logActivity({
      activityType: 'VALIDATION_FAIL',
      description: 'Missing required fields during registration attempt',
      req,
      metadata: { email }
    });
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (!/^[a-zA-Z]+$/.test(first_name) || !/^[a-zA-Z]+$/.test(last_name)) {
    logActivity({
      activityType: 'VALIDATION_FAIL',
      description: 'Invalid characters in first name or last name during registration attempt',
      req,
      metadata: { email }
    });
    return res.status(400).json({ message: 'First name and last name must contain only letters' });
  }
  if (!/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email)) {
    logActivity({
      activityType: 'VALIDATION_FAIL',
      description: 'Invalid email format during registration attempt',
      req,
      metadata: { email }
    });
    return res.status(400).json({ message: 'Invalid email format' });
  }
  if (!/^\d{11}$/.test(phone_number)) {
    logActivity({
      activityType: 'VALIDATION_FAIL',
      description: 'Invalid phone number format during registration attempt',
      req,
      metadata: { email }
    });
    return res.status(400).json({ message: 'Phone number must be 10 digits' });
  }
  if (password.length < 8) {
    logActivity({
      activityType: 'VALIDATION_FAIL',
      description: 'Password too short during registration attempt',
      req,
      metadata: { email }
    });
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }
  if (last_name === password || first_name === password || email === password) {
    logActivity({
      activityType: 'VALIDATION_FAIL',
      description: 'Password cannot be the same as first name, last name, or email during registration attempt',
      req,
      metadata: { email }
    });
    return res.status(400).json({ message: 'Password cannot be the same as first name, last name, or email' });
  }

  

  try {

     const [superAdmins] = await connection.promise().query(
      'SELECT id FROM admin WHERE admin_role = "super_admin" LIMIT 1'
    );
    if (superAdmins.length > 0) {
      logActivity({
        activityType: 'VALIDATION_FAIL',
        tableName: 'admin',
        description: 'Attempt to register another super_admin',
        req,
        metadata: { email }
      });
      return res.status(403).json({ message: 'A super_admin already exists. Only one super_admin is allowed.' });
    }
   
    const emailCheckQuery = 'SELECT id FROM admin WHERE email = ?';
    connection.query(emailCheckQuery, [email], async (emailErr, emailResults) => {
      if (emailErr) {
         logActivity({
          activityType: 'DB_ERROR',
          tableName: 'admin',
          description: `Email check failed for ${email}`,
          req,
          metadata: { error: emailErr.message }
        });
        return res.status(500).json({ message: 'Error checking email', error: emailErr });
      }
      if (emailResults.length > 0) {
        logActivity({
          activityType: 'VALIDATION_FAIL',
          description: `Email already registered: ${email}`,
          req,
          metadata: { email }
        });
         console.log(`Email already registered: ${email}`);
        return res.status(400).json({ message: 'Email already registered' });
      }

   
      const hashedPassword = await bcrypt.hash(password, 10);
      const id = generateId();

      
      const query = `INSERT INTO admin (id, first_name, last_name, email, phone_number, password, admin_role) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      connection.query(query, [id, first_name, last_name, email, phone_number, hashedPassword, 'super_admin'], (err, result) => {
        if (err) {
          logActivity({
            activityType: 'DB_ERROR',
            tableName: 'admin',
            description: `Failed to create admin: ${email}`,
            req,
            metadata: { error: err.message }
          });
          return res.status(500).json({ message: 'Error creating admin', error: err });
        }

         logActivity({
          activityType: 'REGISTER',
          tableName: 'admin',
          recordId: id,
          description: `Registered new admin: ${first_name} ${last_name}`,
          performedBy: `${first_name} ${last_name}`,
          performedById: id,
          performedByRole: 'Admin',
          req,
          significance: 'high',
          metadata: {
            email,
            phone_number
          }
        });

        
        const otpCode = crypto.randomInt(100000, 999999).toString();
const otpQuery = `
    INSERT INTO register_otp (otp_code, inputed_email, expired)
    VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL 3 HOUR)
  `;

  connection.query(otpQuery, [otpCode, email], (otpErr) => {
    if (otpErr) {
      logActivity('ERROR', 'register_otp', `Error saving OTP for email ${email}`, 'System');
      return res.status(500).json({ message: 'Error saving OTP', error: otpErr });
    }
        

          
          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your OTP Code',
            text: `Your OTP code is: ${otpCode}. It will expire in 5 minutes.`,
          };

          transporter.sendMail(mailOptions, (mailErr, info) => {
            if (mailErr) {
              return res.status(500).json({ message: 'Error sending OTP', error: mailErr });
            }

            logActivity({
              activityType: 'OTP_SENT',
              tableName: 'register_otp',
              recordId: id,
              description: `OTP sent to ${email} for registration`,
              performedBy: `${first_name} ${last_name}`,
              performedById: id,
              performedByRole: 'Admin',
              req,
              significance: 'medium',
              metadata: {
                email,
                otpCode
              }
            });

            res.status(200).json({ message: 'Admin registered and OTP sent' });
          });
        });
      });
    });
  } catch (error) {
    logActivity({
      activityType: 'SERVER_ERROR',
      description: `Unexpected error in registration: ${error.message}`,
      req,
      metadata: { stack: error.stack }
    });
    res.status(500).json({ message: 'Server error', error });
  }
});

app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const query = `SELECT * FROM register_otp WHERE inputed_email = ? AND otp_code = ? AND expired > NOW()`;
    connection.query(query, [email, otp], (err, results) => {
      if (err) {
        logActivity('ERROR', 'register_otp', `Error verifying OTP for email ${email}`, 'System');
        return res.status(500).json({ message: 'Error verifying OTP', error: err });
      }

      if (results.length === 0) {
        logActivity('VALIDATION_FAIL', 'register_otp', `Invalid or expired OTP for email ${email}`, 'System');
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }

     
      connection.query('SELECT * FROM admin WHERE email = ?', [email], (adminErr, adminResults) => {
        if (adminErr || adminResults.length === 0) {
          return res.status(400).json({ message: 'Admin not found for this email' });
        }
        const admin = adminResults[0];
        req.session.userId = admin.id;
        req.session.userRole = admin.admin_role || 'Admin';
         req.session.admin = admin; 

        logActivity(
          'OTP_VERIFIED',
          'register_otp',
          results[0].id,
          `OTP verified for email ${email}`,
          'System',
          admin.id,
          admin.admin_role || 'Admin',
          'high',
          req,
          { email, otp }
        );

        const deleteOtpQuery = `DELETE FROM register_otp WHERE inputed_email = ? AND otp_code = ?`;
        connection.query(deleteOtpQuery, [email, otp], (deleteErr) => {
          if (deleteErr) {
            logActivity('ERROR', 'register_otp', `Error deleting OTP for email ${email}`, 'System');
            return res.status(500).json({ message: 'Error deleting OTP', error: deleteErr });
          }

          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Account Created',
            text: `The account associated with email ${email} has been successfully created.`,
          };

          transporter.sendMail(mailOptions, (mailErr, info) => {
            if (mailErr) {
              return res.status(500).json({ message: 'Error sending confirmation email', error: mailErr });
            }

            logActivity('EMAIL_SENT', 'register_otp', results[0].id, `Confirmation email sent to ${email}`, 'System', admin.id, admin.admin_role || 'Admin', 'medium', req, { email });
            res.status(200).json({ message: 'OTP verified, account created, and user logged in', admin });
          });
        });
      });
    });
  } catch (error) {
    logActivity('SERVER_ERROR', 'register_otp', null, `Unexpected error during OTP verification: ${error.message}`, 'System', null, 'System', 'high', req, { email, otp, stack: error.stack });
    res.status(500).json({ message: 'Server error', error });
  }
});



async function getGeoLocation(ip) {
  try {
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    const { city, region, country_name } = response.data;
    return `${city || ''}, ${region || ''}, ${country_name || ''}`.trim();
  } catch (error) {
    console.error('IP Geolocation failed:', error.message);
    return null;
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
      params: {
        format: 'json',
        lat,
        lon
      },
      headers: {
        'User-Agent': 'maskiadmin-management'
      }
    });
    return response.data.display_name || '';
  } catch (error) {
    console.error('Reverse geocoding failed:', error.message);
    return null;
  }
}

cron.schedule('0 * * * *', () => {
  const query = `
    UPDATE login_attempts
    SET status = 'failed'
    WHERE (status = 'pending_otp' OR status = 'pending_approval')
      AND login_time < DATE_SUB(NOW(), INTERVAL 1 HOUR)
  `;
  connection.query(query, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'CRON_JOB_ERROR',
        tableName: 'login_attempts',
        description: 'Failed to update old pending login attempts',
        significance: 'high',
        metadata: { error: err.message }
      });
    } else if (result.affectedRows > 0) {
      logActivity({
        activityType: 'CRON_JOB',
        tableName: 'login_attempts',
        description: `Marked ${result.affectedRows} old pending login attempts as failed`,
        significance: 'medium',
        metadata: { affectedRows: result.affectedRows }
      });
    }
  });
});

app.post('/login', async (req, res) => {
let { email, password, device_id, latitude, longitude } = req.body;

if (isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude))) {
  latitude = null;
  longitude = null;
}

  try {
    if (!email || !password) {
      logActivity('VALIDATION_FAIL', 'admin', `Login attempt failed for email ${email} (missing credentials)`, 'System');
      return res.status(400).json({ message: 'Email and password are required' });
    }

   const query = `SELECT * FROM admin WHERE email = ? AND is_active = 1`;
    connection.query(query, [email], async (err, results) => {
      if (err) {
        logActivity('ERROR', 'admin', `Error checking admin credentials for email ${email}`, 'System');
        return res.status(500).json({ message: 'Error checking admin credentials', error: err });
      }

      if (results.length === 0) {
        connection.query(`INSERT INTO login_attempts (id, email, status, user_agent, device_id, is_new_device) VALUES (?, ?, ?, ?, ?, ?)`, [
          generateId(),
          email,
          'failed',
          req.headers['user-agent'] || '',
          device_id || null,
          0
        ]);

        logActivity('VALIDATION_FAIL', 'admin', `Login attempt failed for email ${email} (not found)`, 'System');

        return res.status(400).json({ message: 'Invalid email or password' });
      }

      const admin = results[0];
      const isPasswordValid = await bcrypt.compare(password, admin.password);
      if (!isPasswordValid) {
        logActivity('VALIDATION_FAIL', 'admin', `Login attempt failed for email ${email} (invalid password)`, 'System');
        return res.status(400).json({ message: 'Invalid email or password' });
      }

      const deviceId = device_id || null;
      const userAgent = req.headers['user-agent'] || '';
     const ipAddress = (req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress || '').split(',')[0].trim();


     let location = '';
     let locationSource = 'IP';

  if (latitude && longitude && latitude !== '0' && longitude !== '0') {
  const geocoded = await reverseGeocode(latitude, longitude);
  if (geocoded) {
    location = geocoded;
    locationSource = 'GPS';
  }
}

if (!location) {
  location = await getGeoLocation(ipAddress) || 'Unknown';
}
      const loginAttemptId = generateId();

     connection.query(
  'SELECT * FROM login_attempts WHERE admin_id = ? AND device_id = ? AND status IN ("approved", "otp_verified")',
  [admin.id, deviceId],
  (devErr, devRows) => {
    const isNewDevice = !deviceId || !devRows.length;
    
const status = isNewDevice && admin.admin_role !== 'super_admin' && admin.admin_role !== 'dev'
  ? 'pending_approval'
  : 'pending_otp';

    const loginAttemptQuery = `
      INSERT INTO login_attempts
      (id, admin_id, email, device_info, ip_address, location, status, user_agent, device_id, is_new_device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    connection.query(
      loginAttemptQuery,
      [
        loginAttemptId,
        admin.id,
        email,
        userAgent,
        ipAddress,
        location,
        status,
        userAgent,
        deviceId,
        isNewDevice ? 1 : 0
      ]
    );

   
    if (isNewDevice && admin.admin_role !== 'super_admin' && admin.admin_role !== 'dev') {
      connection.query(
        `SELECT email FROM admin WHERE admin_role IN ('super_admin', 'manager', 'dev') AND is_active = 1`,
        (roleErr, roleRows) => {
          if (roleErr || !roleRows.length) {
            return res.status(403).json({ message: 'No super_admin or manager or dev available for device approval' });
          }

           const approverEmails = roleRows.map(row => row.email);

          transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: approverEmails,
            subject: 'New Device Login Approval Needed',
            text: `A new device is trying to login for user: ${email}. Approve or reject in the admin dashboard.`
          }, (mailErr) => {
            if (mailErr) {
              logActivity('ERROR', 'login_attempts', `Error sending approval email for new device login for ${email}`, 'System');
              return res.status(500).json({ message: 'Error sending approval email', error: mailErr });
            }
            
          });

          return res.status(403).json({ message: 'New device detected. Waiting for super_admin/manager/dev approval.' });
        }
      );
      return;
    }

 function sendOtpAndRespond(otpRecipients) {
  const otpCode = crypto.randomInt(100000, 999999).toString();

  const otpQuery = `
    INSERT INTO register_otp (otp_code, inputed_email, expired)
    VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL 3 HOUR)
  `;

  connection.query(otpQuery, [otpCode, email], (otpErr) => {
    if (otpErr) {
      logActivity('ERROR', 'register_otp', `Error saving OTP for email ${email}`, 'System');
      return res.status(500).json({ message: 'Error saving OTP', error: otpErr });
    }

    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: otpRecipients,
      subject: 'Login OTP Code',
      text: `A login attempt was made for ${email}. OTP code: ${otpCode}. It will expire in 5 minutes.`
    }, (mailErr) => {
      if (mailErr) {
        return res.status(500).json({ message: 'Error sending OTP', error: mailErr });
      }

    connection.query(
        `UPDATE login_attempts SET status = ? WHERE id = ?`,
        ['otp_sent', loginAttemptId],
        (updateErr) => {
          if (updateErr) {
            logActivity('ERROR', 'login_attempts', `Failed to update status to otp_sent for loginAttemptId ${loginAttemptId}`, 'System');
            return res.status(500).json({ message: 'Error updating login attempt status', error: updateErr });
          }
          res.status(200).json({
            message: `Login successful, OTP sent to super_admin(s)/manager(s)/dev(s) for approval`,
            login_attempt_id: loginAttemptId
          });
        }
      );
    });
  });
}

    if (admin.admin_role !== 'super_admin' && admin.admin_role !== 'manager' && admin.admin_role !== 'dev') {
      connection.query(
  `SELECT email FROM admin WHERE admin_role IN ('super_admin', 'manager', 'dev') AND is_active = 1`,
        (roleErr, roleRows) => {
          if (roleErr || !roleRows.length) {
            return res.status(403).json({ message: 'No super_admin or manager or dev available for OTP approval' });
          }
           const otpRecipients = roleRows.map(row => row.email);
          sendOtpAndRespond(otpRecipients);
        }
      );
    } else {
      sendOtpAndRespond(email);
    }
  }
);
    });
  } catch (error) {
    logActivity('SERVER_ERROR', 'admin', null, `Unexpected error during admin login: ${error.message}`, 'System', null, 'System', 'high', req, {
      email, password, stack: error.stack
    });
    res.status(500).json({ message: 'Server error', error });
  }
});

app.post('/approve-device', (req, res) => {
  const { login_attempt_id, approve } = req.body;

  if (!req.session?.admin || !['super_admin', 'manager', 'dev'].includes(req.session.admin.admin_role)) {
    return res.status(403).json({ message: 'Only super_admin or manager or dev can approve devices.' });
  }
  const status = approve ? 'approved' : 'rejected';
  connection.query(
    'UPDATE login_attempts SET status = ?, approved_by = ?, approved_by_role = ? WHERE id = ?',
    [status, req.session.admin.id, req.session.admin.admin_role, login_attempt_id],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Failed to update device approval', error: err });
      res.json({ message: `Device ${status}` });
    }
  );
});

app.post('/approve-device/:admin_id', (req, res) => {
  const { admin_id } = req.params;
  const { login_attempt_id, approve } = req.body;

  connection.query(
    'SELECT admin_role FROM admin WHERE id = ? AND is_active = 1',
    [admin_id],
    (err, rows) => {
      if (err || !rows.length || !['super_admin', 'manager', 'dev'].includes(rows[0].admin_role)) {
        return res.status(403).json({ message: 'Only super_admin or manager or dev can approve devices.' });
      }

      const status = approve ? 'approved' : 'rejected';

      connection.query(
        'UPDATE login_attempts SET status = ?, approved_by = ?, approved_by_role = ? WHERE id = ?',
        [status, admin_id, rows[0].admin_role, login_attempt_id],
        (updateErr) => {
          if (updateErr) {
            return res.status(500).json({ message: 'Failed to update device approval', error: updateErr });
          }

          if (approve) {
            connection.query(
              'SELECT email FROM login_attempts WHERE id = ?',
              [login_attempt_id],
              (emailErr, emailRows) => {
                if (!emailErr && emailRows.length) {
                  const email = emailRows[0].email;
                  transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: email,
                    subject: 'Device Approved - Login Now',
                    text: `Your new device has been approved. You can now try to log in on the new device.`
                  });
                }
              }
            );
          }

          const message = approve ? 'Device approved' : 'Device rejected';
          return res.json({ message });
        }
      );
    }
  );
});


app.delete('/login_attempts/:login_attempt_id', (req, res) => {
  const { login_attempt_id } = req.params;
  connection.query(
    'DELETE FROM login_attempts WHERE id = ?',
    [login_attempt_id],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Failed to delete login attempt', error: err });
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Login attempt not found' });
      res.json({ message: 'Login attempt deleted' });
    }
  );
});

app.post('/verify-login-otp', async (req, res) => {
const { email, otp, login_attempt_id } = req.body;

 if (!login_attempt_id) {
    return res.status(400).json({ message: 'Missing login attempt ID' });
  }


  try {
    const query = `SELECT * FROM register_otp WHERE inputed_email = ? AND otp_code = ? AND expired > NOW()`;
    connection.query(query, [email, otp], (err, results) => {
      if (err) {
        logActivity('ERROR', 'register_otp', `Error verifying OTP for email ${email}`, 'System');
        return res.status(500).json({ message: 'Error verifying OTP', error: err });
      }

      if (results.length === 0) {
       connection.query(
  'UPDATE login_attempts SET status = ? WHERE id = ?',
  ['otp_failed', login_attempt_id]
);
        logActivity('VALIDATION_FAIL', 'register_otp', `Invalid or expired OTP for email ${email}`, 'System');
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }

    
      connection.query('SELECT * FROM admin WHERE email = ?', [email], (adminErr, adminResults) => {
        if (adminErr || adminResults.length === 0) {
          return res.status(400).json({ message: 'Admin not found for this email' });
        }
        const admin = adminResults[0];
        req.session.userId = admin.id;
        req.session.userRole = admin.admin_role || 'Admin';
        req.session.admin = admin; 

      connection.query(
  'UPDATE login_attempts SET status = ? WHERE id = ?',
  ['otp_verified', login_attempt_id]
);

        logActivity(
          'OTP_VERIFIED',
          'register_otp',
          results[0].id,
          `OTP verified for email ${email}`,
          'System',
          admin.id,
          admin.admin_role || 'Admin',
          'medium',
          req,
          { email, otp }
        );
        res.status(200).json({ message: 'Login OTP verified, login successful', admin });
      });
    });
  } catch (error) {
    logActivity(
      'SERVER_ERROR',
      'register_otp',
      null,
      `Unexpected error during OTP verification: ${error.message}`,
      'System',
      null,
      'System',
      'high',
      req,
      { email, otp, stack: error.stack }
    );
    res.status(500).json({ message: 'Server error', error });
  }
});

app.get('/pending-login-attempts', (req, res) => {
  if (!req.session?.admin || !['super_admin', 'dev', 'manager'].includes(req.session.admin.admin_role)) {
    return res.status(403).json({ message: 'Only super_admin or manager or dev can view pending approvals.' });
  }

  const query = `
    SELECT 
      la.id AS login_attempt_id,
      la.admin_id,
      a.first_name,
      a.last_name,
      la.email,
      la.device_id,
      la.device_info,
      la.ip_address,
      la.location,
      la.status,
      la.login_time,
      la.is_new_device,
      la.user_agent
    FROM login_attempts la
    JOIN admin a ON la.admin_id = a.id
    WHERE la.status IN ('pending_approval', 'pending_otp')
    ORDER BY la.login_time DESC
  `;

  connection.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to fetch pending login attempts', error: err });
    }
    res.status(200).json(results);
  });
});


app.get('/pending-login-attempts/:admin_id', (req, res) => {
  const { admin_id } = req.params;
  if (!admin_id) {
    return res.status(400).json({ message: 'Missing admin_id' });
  }

  
  connection.query(
    'SELECT admin_role FROM admin WHERE id = ? AND is_active = 1',
    [admin_id],
    (err, rows) => {
      if (err || !rows.length) {
        return res.status(403).json({ message: 'Admin not found or inactive.' });
      }
      const role = rows[0].admin_role;
      if (!['super_admin', 'dev', 'manager'].includes(role)) {
        return res.status(403).json({ message: 'Only super_admin or dev or manager can view pending approvals.' });
      }

     const query = `
  SELECT 
    la.id AS login_attempt_id,
    la.admin_id,
    a.first_name,
    a.last_name,
    la.email,
    la.device_id,
    la.device_info,
    la.ip_address,
    la.location,
    la.status,
    la.login_time,
    la.is_new_device,
    la.user_agent
  FROM login_attempts la
  JOIN admin a ON la.admin_id = a.id
  -- Remove or expand the status filter as needed:
  -- To show ALL attempts, comment out or remove the next line:
  -- WHERE la.status IN ('pending_approval', 'pending_otp', 'approved', 'rejected', 'otp_failed', 'otp_verified', 'failed', 'cancelled')
  ORDER BY la.login_time DESC
`;
      connection.query(query, (err, results) => {
        if (err) {
          return res.status(500).json({ message: 'Failed to fetch pending login attempts', error: err });
        }
        res.status(200).json(results);
      });
    }
  );
});



  app.get('/login_attempts/today', (req, res) => {
  const query = `
    SELECT 
      COUNT(*) AS total,
      SUM(status = 'otp_verified') AS successful,
      SUM(status IN ('failed', 'otp_failed')) AS failed
    FROM login_attempts
    WHERE DATE(login_time) = CURDATE()
  `;
  const listQuery = `
    SELECT id, admin_id, email, status, login_time, device_id, ip_address, location
    FROM login_attempts
    WHERE DATE(login_time) = CURDATE()
    ORDER BY login_time DESC
  `;
  connection.query(query, (err, statsRows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch login stats', details: err.message });
    connection.query(listQuery, (err2, listRows) => {
      if (err2) return res.status(500).json({ error: 'Failed to fetch login attempts', details: err2.message });
      res.json({
        total: statsRows[0].total,
        successful: statsRows[0].successful,
        failed: statsRows[0].failed,
        attempts: listRows
      });
    });
  });
});






app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        logActivity('ERROR', 'session', 'Error during logout', 'System');
        return res.status(500).json({ message: 'Error during logout' });
      }
      logActivity('LOGOUT', 'session', null, 'User logged out', 'System');
      res.status(200).json({ message: 'Logged out successfully' });
    });
  });

 app.post('/forgot-password', (req, res) => {
    const { email } = req.body;
  
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    
  
    
    const query = 'SELECT * FROM admin WHERE email = ?';
    connection.query(query, [email], (err, results) => {
      if (err) {
        logActivity('ERROR', 'admin', `Error verifying email for forgot password: ${email}`, 'System');
        return res.status(500).json({ error: 'Failed to verify email' });
      }
  
      if (results.length === 0) {
        logActivity('VALIDATION_FAIL', 'admin', `Email not found for forgot password: ${email}`, 'System');
      return res.status(404).json({ error: 'Email not found' });
    }
  
      
      const otpCode = crypto.randomInt(100000, 999999).toString();
  
     
 const otpQuery = `
    INSERT INTO register_otp (otp_code, inputed_email, expired)
    VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL 3 HOUR)
  `;

  connection.query(otpQuery, [otpCode, email], (otpErr) => {
    if (otpErr) {
      logActivity('ERROR', 'register_otp', `Error saving OTP for email ${email}`, 'System');
      return res.status(500).json({ message: 'Error saving OTP', error: otpErr });
    }
        logActivity(
          'OTP_GENERATED',
          'register_otp',
          null,
          `Generated OTP for password reset for email ${email}`,
          'System',
          null,
          'System',
          'medium',
          req,
          { email, otpCode }
        );
  
      
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Password Reset OTP',
          text: `Your OTP for password reset is: ${otpCode}. It will expire in 5 minutes.`,
        };
  
        transporter.sendMail(mailOptions, (mailErr, info) => {
          if (mailErr) {
             logActivity(
              'ERROR',
              'register_otp',
              null,
              `Error sending OTP for password reset to ${email}`,
              'System',
              null,
              'System',
              'high',
              req,
              { email, otpCode, error: mailErr.message }
            );
            console.error('Error sending OTP:', mailErr);
            return res.status(500).json({ error: 'Failed to send OTP' });
          }

          logActivity(
            'EMAIL_SENT',
            'register_otp',
            null,
            `OTP sent to ${email} for password reset`,
            'System',
            null,
            'System',
            'medium',
            req,
            { email, otpCode }
          );
  
          res.status(200).json({ message: 'OTP sent successfully' });
        });
      });
    });
  });

  app.post('/verify-forgot-password-otp', (req, res) => {
    const { email, otp } = req.body;
  
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }
  
    const query = `SELECT * FROM register_otp WHERE inputed_email = ? AND otp_code = ? AND expired > NOW()`;
    
    connection.query(query, [email, otp], (err, results) => {
      if (err) {
        logActivity('ERROR', 'register_otp', `Error verifying OTP for email ${email}`, 'System');
        return res.status(500).json({ error: 'Failed to verify OTP' });
      }
  
      if (results.length === 0) {
        logActivity('FAILED', 'register_otp', `Invalid or expired OTP for email: ${email}`, 'System');
        return res.status(400).json({ error: 'Invalid or expired OTP' });
      }
  
      logActivity(
        'OTP_VERIFIED',
        'register_otp',
        results[0].id,
        `OTP verified for password reset for email ${email}`,
        'System',
        null,
        'System',
        'medium',
        req,
        { email, otp }
      );
      res.status(200).json({ message: 'OTP verified successfully' });
    });
  });
  
  
app.get('/admin/notifications/:admin_id', async (req, res) => {
  const { admin_id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 7;
  const offset = (page - 1) * limit;

  if (!admin_id) return res.status(400).json({ message: 'Missing admin_id' });

  try {
    const maxPerType = 50; 

    const [loginAttempts] = await connection.promise().query(`
      SELECT 'login_attempt' AS type, la.id AS ref_id, la.status, la.email, la.login_time, la.device_info, la.user_agent, la.ip_address, la.location
      FROM login_attempts la
      WHERE la.status IN ('pending_approval', 'pending_otp', 'otp_failed', 'otp_verified', 'approved', 'rejected')
      ORDER BY la.login_time DESC
      LIMIT ?
    `, [maxPerType]);

    const [activityLogs] = await connection.promise().query(`
      SELECT 'activity_log' AS type, id AS ref_id, activity_type, description, created_at
      FROM activity_logs
      WHERE performed_by_id = ? OR performed_by_role IN ('super_admin', 'dev')
      ORDER BY created_at DESC
      LIMIT ?
    `, [admin_id, maxPerType]);

    const [lowStock] = await connection.promise().query(`
      SELECT 'low_stock' AS type, pv.variations_id AS ref_id, pv.product_name, pv.current_variations_stock_qty_number, pv.stock_qty_alert_level
      FROM product_variations pv
      WHERE pv.current_variations_stock_qty_number <= pv.stock_qty_alert_level AND pv.stock_qty_alert_level > 0
      ORDER BY pv.current_variations_stock_qty_number ASC
      LIMIT ?
    `, [maxPerType]);

    const [pendingExpenses] = await connection.promise().query(`
      SELECT 'expense_approval' AS type, expense_id AS ref_id, expense_category_name, amount, description, date
      FROM expense
      WHERE expense_status = 'pending'
      ORDER BY date DESC
      LIMIT ?
    `, [maxPerType]);

    const [stockModifications] = await connection.promise().query(`
      SELECT 
        'stock_modification' AS type,
        sm.stock_modify_id AS ref_id,
        sm.product_name,
        sm.variations_id,
        sm.size,
        sm.adjustment_action,
        sm.adjustment_type,
        sm.adjustment_reason,
        sm.notes,
        sm.date,
        sm.performed_by
      FROM stock_modify sm
      ORDER BY sm.date DESC
      LIMIT ?
    `, [maxPerType]);

    const [staffSurcharges] = await connection.promise().query(`
      SELECT 
        'staff_surcharge' AS type,
        ss.id AS ref_id,
        ss.staff_id,
        st.full_name,
        ss.sub_charge_amt AS amount,
        ss.reason,
        ss.created_at AS date
      FROM staff_subcharge ss
      JOIN staff st ON ss.staff_id = st.staff_id
      ORDER BY ss.created_at DESC
      LIMIT ?
    `, [maxPerType]);

    const [staffAdded] = await connection.promise().query(`
      SELECT 
        'staff_added' AS type,
        s.staff_id AS ref_id,
        s.full_name,
        s.email,
        s.created_at AS date
      FROM staff s
      ORDER BY s.created_at DESC
      LIMIT ?
    `, [maxPerType]);

    const [shiftChanges] = await connection.promise().query(`
      SELECT 
        'shift_change' AS type,
        sh.shift_id AS ref_id,
        sh.staff_id,
        sh.fullname,
        sh.working_hours,
        sh.work_days,
        sh.created_at AS date
      FROM staff_shifts sh
      ORDER BY sh.created_at DESC
      LIMIT ?
    `, [maxPerType]);

    
    const allNotifications = [
      ...loginAttempts,
      ...activityLogs,
      ...lowStock,
      ...pendingExpenses,
      ...stockModifications,
      ...staffSurcharges,
      ...staffAdded,
      ...shiftChanges
    ].sort((a, b) => {
      const dateA = new Date(a.login_time || a.created_at || a.date || 0);
      const dateB = new Date(b.login_time || b.created_at || b.date || 0);
      return dateB - dateA; 
    });

    
    const paginatedNotifications = allNotifications.slice(offset, offset + limit);

    res.json({
      notifications: paginatedNotifications,
      total: allNotifications.length,
      page,
      totalPages: Math.ceil(allNotifications.length / limit)
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch notifications', error: err.message });
  }
});


app.get('/admin/notifications-count/:admin_id', async (req, res) => {
  const { admin_id } = req.params;
  if (!admin_id) return res.status(400).json({ message: 'Missing admin_id' });

  try {
    
    const [[{ count: pendingLogin }]] = await connection.promise().query(
      `SELECT COUNT(*) as count FROM login_attempts WHERE status IN ('pending_approval', 'pending_otp')`
    );
   
    const [[{ count: pendingExpenses }]] = await connection.promise().query(
      `SELECT COUNT(*) as count FROM expense WHERE expense_status = 'pending'`
    );
    
    const [[{ count: lowStock }]] = await connection.promise().query(
      `SELECT COUNT(*) as count FROM product_variations WHERE current_variations_stock_qty_number <= stock_qty_alert_level AND stock_qty_alert_level > 0`
    );
    
    const [[{ count: activityLogs }]] = await connection.promise().query(
      `SELECT COUNT(*) as count FROM activity_logs WHERE performed_by_id = ? OR performed_by_role IN ('super_admin', 'dev')`,
      [admin_id]
    );

    const [[{ count: stockModifications }]] = await connection.promise().query(
  `SELECT COUNT(*) as count FROM stock_modify WHERE DATE(date) = CURDATE()`
);

const [[{ count: staffSurcharges }]] = await connection.promise().query(`
  SELECT COUNT(*) as count FROM staff_subcharge WHERE DATE(created_at) = CURDATE()
`);

const [[{ count: staffAdded }]] = await connection.promise().query(`
  SELECT COUNT(*) as count FROM staff WHERE DATE(created_at) = CURDATE()
`);

const [[{ count: shiftChanges }]] = await connection.promise().query(`
  SELECT COUNT(*) as count FROM staff_shifts WHERE DATE(created_at) = CURDATE()
`);


   const total = pendingLogin + pendingExpenses + lowStock + activityLogs + stockModifications + staffSurcharges + staffAdded + shiftChanges;
res.json({ count: total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch notification count', error: err.message });
  }
});

    app.get('/admin', (req, res) => {
    
  const query = 'SELECT id, first_name, password, last_name, email, phone_number, created_at, admin_role FROM admin';
  
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'admin',
        description: 'Failed to fetch admin list',
        performedById: req.session.userId,
        performedByRole: req.session.userRole,
        req,
        significance: 'high',
        metadata: {
          error: err.message
        }
      });
      return res.status(500).json({ error: 'Failed to fetch admin accounts' });
    }

    logActivity({
      activityType: 'FETCH_ALL',
      tableName: 'admin',
      description: 'Fetched complete admin list',
      performedById: req.session.userId,
      performedByRole: req.session.userRole,
      req,
      significance: 'medium',
      metadata: {
        count: results.length,
        sensitive: true
      }
    });
    
    res.status(200).json(results);
  });
});

 app.get('/admin/email/:email', (req, res) => {
  const { email } = req.params;
  
  if (!req.session?.userId) {
    logActivity({
      activityType: 'ACCESS_DENIED',
      tableName: 'admin',
      description: `Unauthorized access attempt to admin: ${email}`,
      req,
      significance: 'high',
      metadata: {
        attemptedEmail: email,
        ip: req.ip
      }
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const query = 'SELECT id, first_name, password, last_name, email, phone_number, created_at FROM admin WHERE email = ?';
  
  connection.query(query, [email], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'admin',
        description: `Failed to fetch admin: ${email}`,
        performedById: req.session.userId,
        performedByRole: req.session.userRole,
        req,
        significance: 'high',
        metadata: {
          email,
          error: err.message
        }
      });
      return res.status(500).json({ error: 'Failed to fetch admin account' });
    }
    
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'admin',
        description: `Admin not found: ${email}`,
        performedById: req.session.userId,
        performedByRole: req.session.userRole,
        req,
        significance: 'medium',
        metadata: { email }
      });
      return res.status(404).json({ error: 'Admin account not found' });
    }
    
    const admin = results[0];
    logActivity({
      activityType: 'FETCH_ONE',
      tableName: 'admin',
      recordId: admin.id,
      description: `Viewed admin details for ${email}`,
      performedById: req.session.userId,
      performedByRole: req.session.userRole,
      req,
      significance: 'medium',
      metadata: {
        email,
        fieldsAccessed: Object.keys(admin) 
      }
    });
    
    res.status(200).json(admin);
  });
});

app.get('/admin/:adminId', (req, res) => {
  const { adminId } = req.params;
  
  if (!req.session?.userId) {
    logActivity({
      activityType: 'ACCESS_DENIED',
      tableName: 'admin',
      description: `Unauthorized access attempt to admin ID: ${adminId}`,
      req,
      significance: 'high',
      metadata: {
        attemptedAdminId: adminId,
        ip: req.ip
      }
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const query = 'SELECT id, first_name, password, last_name, email, phone_number, created_at FROM admin WHERE id = ?';
  
  connection.query(query, [adminId], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'admin',
        description: `Failed to fetch admin ID: ${adminId}`,
        performedById: req.session.userId,
        performedByRole: req.session.userRole,
        req,
        significance: 'high',
        metadata: {
          adminId,
          error: err.message
        }
      });
      return res.status(500).json({ error: 'Failed to fetch admin account' });
    }
    
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'admin',
        description: `Admin not found with ID: ${adminId}`,
        performedById: req.session.userId,
        performedByRole: req.session.userRole,
        req,
        significance: 'medium',
        metadata: { adminId }
      });
      return res.status(404).json({ error: 'Admin account not found' });
    }
    
    const admin = results[0];
    logActivity({
      activityType: 'FETCH_ONE',
      tableName: 'admin',
      recordId: admin.id,
      description: `Viewed admin details for ID ${adminId}`,
      performedById: req.session.userId,
      performedByRole: req.session.userRole,
      req,
      significance: 'medium',
      metadata: {
        adminId,
        fieldsAccessed: Object.keys(admin) 
      }
    });
    
    res.status(200).json(admin);
  });
});


app.patch('/admin/:adminId', upload.single('admin_profile_image'), async (req, res) => {
  const { adminId } = req.params;
  const {
    first_name,
    last_name,
    email,
    phone_number,
    password,
    admin_role,
    is_active,
    failed_login_attempts,
    account_locked_until
  } = req.body;

  if (
    !first_name &&
    !last_name &&
    !email &&
    !phone_number &&
    !password &&
    !req.file &&
    !admin_role &&
    is_active === undefined &&
    failed_login_attempts === undefined &&
    !account_locked_until
  ) {
    logActivity({
      activityType: 'VALIDATION_FAIL',
      tableName: 'admin',
      description: 'No valid fields provided for admin update',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { adminId }
    });
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  try {
    const [currentAdmin] = await connection.promise().query(
      'SELECT * FROM admin WHERE id = ?', [adminId]
    );

    if (!currentAdmin.length) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'admin',
        description: `Admin not found for update: ${adminId}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: { adminId }
      });
      return res.status(404).json({ error: 'Admin account not found' });
    }

    const updateFields = [];
    const updateValues = [];
    const changes = {};

    if (first_name && first_name !== currentAdmin[0].first_name) {
      if (!/^[a-zA-Z]+$/.test(first_name)) {
        return res.status(400).json({ error: 'First name must contain only letters' });
      }
      updateFields.push('first_name = ?');
      updateValues.push(first_name);
      changes.first_name = { from: currentAdmin[0].first_name, to: first_name };
    }

    if (last_name && last_name !== currentAdmin[0].last_name) {
      if (!/^[a-zA-Z]+$/.test(last_name)) {
        return res.status(400).json({ error: 'Last name must contain only letters' });
      }
      updateFields.push('last_name = ?');
      updateValues.push(last_name);
      changes.last_name = { from: currentAdmin[0].last_name, to: last_name };
    }

    if (email && email !== currentAdmin[0].email) {
      if (!/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      updateFields.push('email = ?');
      updateValues.push(email);
      changes.email = { from: currentAdmin[0].email, to: email };
    }

    if (phone_number && phone_number !== currentAdmin[0].phone_number) {
      if (!/^\d{10,15}$/.test(phone_number)) {
        return res.status(400).json({ error: 'Phone number must be 10-15 digits' });
      }
      updateFields.push('phone_number = ?');
      updateValues.push(phone_number);
      changes.phone_number = { from: currentAdmin[0].phone_number, to: phone_number };
    }

    let passwordUpdated = false;
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password = ?');
      updateValues.push(hashedPassword);
      passwordUpdated = true;
      changes.password = { updated: true };
    }

    if (req.file) {
      updateFields.push('admin_profile_image = ?');
      updateValues.push(req.file.filename);
      changes.admin_profile_image = { updated: true };
    }

    if (admin_role && admin_role !== currentAdmin[0].admin_role) {
      updateFields.push('admin_role = ?');
      updateValues.push(admin_role);
      changes.admin_role = { from: currentAdmin[0].admin_role, to: admin_role };
    }

    if (is_active !== undefined && is_active !== currentAdmin[0].is_active) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active);
      changes.is_active = { from: currentAdmin[0].is_active, to: is_active };
    }

    if (failed_login_attempts !== undefined && failed_login_attempts !== currentAdmin[0].failed_login_attempts) {
      updateFields.push('failed_login_attempts = ?');
      updateValues.push(failed_login_attempts);
      changes.failed_login_attempts = { from: currentAdmin[0].failed_login_attempts, to: failed_login_attempts };
    }

    if (account_locked_until && account_locked_until !== currentAdmin[0].account_locked_until) {
      updateFields.push('account_locked_until = ?');
      updateValues.push(account_locked_until);
      changes.account_locked_until = { from: currentAdmin[0].account_locked_until, to: account_locked_until };
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid changes provided' });
    }

    const query = `UPDATE admin SET ${updateFields.join(', ')} WHERE id = ?`;
    updateValues.push(adminId);

    await connection.promise().query(query, updateValues);

    logActivity({
      activityType: 'UPDATE',
      tableName: 'admin',
      recordId: adminId,
      description: `Updated admin ${adminId}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'high',
      metadata: {
        changes,
        passwordUpdated,
        updatedBy: req.session?.userId || 'system'
      }
    });

   
    if (Object.keys(changes).length > 0) {
      const changeList = Object.entries(changes)
        .map(([field, change]) => {
          if (field === 'password') return '• Password was updated';
          if (field.endsWith('_image')) return `• ${field.replace('_', ' ')} was updated`;
          return `• ${field.replace('_', ' ')} changed from "${change.from}" to "${change.to}"`;
        })
        .join('\n');

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email || currentAdmin[0].email,
        subject: 'Your Admin Account Has Been Updated',
        text: `The following changes were made to your account:\n\n${changeList}\n\nIf you didn't make these changes, please contact support immediately.`
      };

      try {
        await transporter.sendMail(mailOptions);
        logActivity({
          activityType: 'NOTIFICATION_SENT',
          tableName: 'admin',
          recordId: adminId,
          description: `Update notification sent to ${mailOptions.to}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'medium',
          metadata: {
            email: mailOptions.to,
            changesNotified: Object.keys(changes)
          }
        });
      } catch (mailError) {
        logActivity({
          activityType: 'NOTIFICATION_FAILED',
          tableName: 'admin',
          recordId: adminId,
          description: `Failed to send update notification to ${mailOptions.to}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'medium',
          metadata: {
            error: mailError.message,
            email: mailOptions.to
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Admin updated successfully',
      changes: Object.keys(changes)
    });

  } catch (error) {
    logActivity({
      activityType: 'UPDATE_FAILED',
      tableName: 'admin',
      recordId: adminId,
      description: `Failed to update admin ${adminId}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'high',
      metadata: {
        error: error.message,
        stack: error.stack
      }
    });
    res.status(500).json({ error: 'Failed to update admin account' });
  }
});

app.patch('/admin/email/:adminEmail', upload.single('admin_profile_image'), async (req, res) => {
  const adminEmail = req.params.adminEmail;
  const {
    first_name,
    last_name,
    email,
    phone_number,
    password,
    admin_role,
    is_active,
    failed_login_attempts,
    account_locked_until
  } = req.body;

  if (
    !first_name &&
    !last_name &&
    !email &&
    !phone_number &&
    !password &&
    !req.file &&
    !admin_role &&
    is_active === undefined &&
    failed_login_attempts === undefined &&
    !account_locked_until
  ) {
    logActivity({
      activityType: 'VALIDATION_FAIL',
      tableName: 'admin',
      description: 'No valid fields provided for admin update',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { adminEmail }
    });
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  try {
    const [currentAdmin] = await connection.promise().query(
      'SELECT * FROM admin WHERE email = ?', [adminEmail]
    );

    if (!currentAdmin.length) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'admin',
        description: `Admin not found for update: ${adminEmail}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: { adminEmail }
      });
      return res.status(404).json({ error: 'Admin account not found' });
    }

    const updateFields = [];
    const updateValues = [];
    const changes = {};

    if (first_name && first_name !== currentAdmin[0].first_name) {
      if (!/^[a-zA-Z]+$/.test(first_name)) {
        return res.status(400).json({ error: 'First name must contain only letters' });
      }
      updateFields.push('first_name = ?');
      updateValues.push(first_name);
      changes.first_name = { from: currentAdmin[0].first_name, to: first_name };
    }

    if (last_name && last_name !== currentAdmin[0].last_name) {
      if (!/^[a-zA-Z]+$/.test(last_name)) {
        return res.status(400).json({ error: 'Last name must contain only letters' });
      }
      updateFields.push('last_name = ?');
      updateValues.push(last_name);
      changes.last_name = { from: currentAdmin[0].last_name, to: last_name };
    }

    if (email && email !== currentAdmin[0].email) {
      if (!/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      updateFields.push('email = ?');
      updateValues.push(email);
      changes.email = { from: currentAdmin[0].email, to: email };
    }

    if (phone_number && phone_number !== currentAdmin[0].phone_number) {
      if (!/^\d{10,15}$/.test(phone_number)) {
        return res.status(400).json({ error: 'Phone number must be 10-15 digits' });
      }
      updateFields.push('phone_number = ?');
      updateValues.push(phone_number);
      changes.phone_number = { from: currentAdmin[0].phone_number, to: phone_number };
    }

    let passwordUpdated = false;
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password = ?');
      updateValues.push(hashedPassword);
      passwordUpdated = true;
      changes.password = { updated: true };
    }

    if (req.file) {
      updateFields.push('admin_profile_image = ?');
      updateValues.push(req.file.filename);
      changes.admin_profile_image = { updated: true };
    }

    if (admin_role && admin_role !== currentAdmin[0].admin_role) {
      updateFields.push('admin_role = ?');
      updateValues.push(admin_role);
      changes.admin_role = { from: currentAdmin[0].admin_role, to: admin_role };
    }

    if (is_active !== undefined && is_active !== currentAdmin[0].is_active) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active);
      changes.is_active = { from: currentAdmin[0].is_active, to: is_active };
    }

    if (failed_login_attempts !== undefined && failed_login_attempts !== currentAdmin[0].failed_login_attempts) {
      updateFields.push('failed_login_attempts = ?');
      updateValues.push(failed_login_attempts);
      changes.failed_login_attempts = { from: currentAdmin[0].failed_login_attempts, to: failed_login_attempts };
    }

    if (account_locked_until && account_locked_until !== currentAdmin[0].account_locked_until) {
      updateFields.push('account_locked_until = ?');
      updateValues.push(account_locked_until);
      changes.account_locked_until = { from: currentAdmin[0].account_locked_until, to: account_locked_until };
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid changes provided' });
    }

    const query = `UPDATE admin SET ${updateFields.join(', ')} WHERE email = ?`;
    updateValues.push(adminEmail);

    await connection.promise().query(query, updateValues);

    logActivity({
      activityType: 'UPDATE',
      tableName: 'admin',
      recordId: currentAdmin[0].id,
      description: `Updated admin ${adminEmail}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'high',
      metadata: {
        changes,
        passwordUpdated,
        updatedBy: req.session?.userId || 'system'
      }
    });

    
    if (Object.keys(changes).length > 0) {
      const changeList = Object.entries(changes)
        .map(([field, change]) => {
          if (field === 'password') return '• Password was updated';
          if (field.endsWith('_image')) return `• ${field.replace('_', ' ')} was updated`;
          return `• ${field.replace('_', ' ')} changed from "${change.from}" to "${change.to}"`;
        })
        .join('\n');

        let mailText = `The following changes were made to your account:\n\n${changeList}\n\nIf you didn't make these changes, please contact support immediately.`;

      
      if (passwordUpdated && password) {
        mailText += `\n\nYour new password for logins is : ${password}\nPlease keep it safe and do not share it with anyone.`;
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email || currentAdmin[0].email,
        subject: 'Your Admin Account Has Been Updated',
        text: mailText
      };

      try {
        await transporter.sendMail(mailOptions);
        logActivity({
          activityType: 'NOTIFICATION_SENT',
          tableName: 'admin',
          recordId: currentAdmin[0].id,
          description: `Update notification sent to ${mailOptions.to}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'medium',
          metadata: {
            email: mailOptions.to,
            changesNotified: Object.keys(changes)
          }
        });
      } catch (mailError) {
        logActivity({
          activityType: 'NOTIFICATION_FAILED',
          tableName: 'admin',
          recordId: currentAdmin[0].id,
          description: `Failed to send update notification to ${mailOptions.to}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'medium',
          metadata: {
            error: mailError.message,
            email: mailOptions.to
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Admin updated successfully',
      changes: Object.keys(changes)
    });

  } catch (error) {
    logActivity({
      activityType: 'UPDATE_FAILED',
      tableName: 'admin',
      recordId: adminEmail,
      description: `Failed to update admin ${adminEmail}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'high',
      metadata: {
        error: error.message,
        stack: error.stack
      }
    });
    res.status(500).json({ error: 'Failed to update admin account' });
  }
});

app.patch('/admin/password/:adminId', async (req, res) => {
  const { adminId } = req.params;
  const { old_password, password, confirmPassword } = req.body;

  if (!old_password || !password || !confirmPassword) {
    return res.status(400).json({ error: 'old_password, password, and confirmPassword are required' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const [adminRows] = await connection.promise().query(
      'SELECT * FROM admin WHERE id = ?', [adminId]
    );
    if (!adminRows.length) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    const admin = adminRows[0];
    const isOldPasswordValid = await bcrypt.compare(old_password, admin.password);
    if (!isOldPasswordValid) {
      return res.status(400).json({ error: 'Old password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await connection.promise().query(
      'UPDATE admin SET password = ? WHERE id = ?',
      [hashedPassword, adminId]
    );

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: admin.email,
      subject: 'Your Password Has Been Changed',
      text: `Hello ${admin.first_name},\n\nYour password has been changed successfully.\n\nYour new password is: ${password}\n\nIf you did not request this change, please contact support immediately.`
    };
    try {
      await transporter.sendMail(mailOptions);
    } catch (mailErr) {
    
      logActivity({
        activityType: 'NOTIFICATION_FAILED',
        tableName: 'admin',
        recordId: adminId,
        description: `Failed to send password change email to ${admin.email}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: { error: mailErr.message, email: admin.email }
      });
    }

    logActivity({
      activityType: 'PASSWORD_CHANGE',
      tableName: 'admin',
      recordId: adminId,
      description: `Admin password changed`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'high',
      metadata: { adminId }
    });

    res.status(200).json({ message: 'Password updated and sent to your email.' });
  } catch (error) {
    logActivity({
      activityType: 'PASSWORD_CHANGE_FAILED',
      tableName: 'admin',
      recordId: adminId,
      description: `Failed to change password for admin ${adminId}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'high',
      metadata: { error: error.message, stack: error.stack }
    });
    res.status(500).json({ error: 'Failed to update password' });
  }
});

app.post('/product', upload.single('product_featured_image'), (req, res) => {
  const {
    product_name,
    category_name,
    category_id,
    brand,
    unit_name,
    product_description,
    product_alert_limit
  } = req.body;

  const product_featured_image = req.file ? req.file.filename : null;

  if (
    !product_name ||
    !category_name ||
    !category_id ||
    !unit_name ||
    !product_description ||
    !product_featured_image ||
    !product_alert_limit
  ) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }

  const product_id = generateId();
const query = `INSERT INTO product (
    product_id, product_name, category_name, category_id, brand, unit_name, product_alert_limit, product_description, product_featured_image
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;


  logActivity({
    activityType: 'CREATE',
    tableName: 'product',
    recordId: product_id,
    description: `Creating new product: ${product_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {
      product_id,
      product_name,
      category_name,
      category_id,
      brand,
      unit_name,
      product_alert_limit,
      product_description,
      product_featured_image
    }
  });

  connection.query(
    query,
    [
      product_id,
      product_name,
      category_name,
      category_id,
      brand || null,
      unit_name,
      product_alert_limit || 0,
      product_description || null,
      product_featured_image
    ],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'product',
          recordId: product_id,
          description: `Failed to create product: ${product_name}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create product', details: err.message });
      }
      res.status(201).json({ message: 'Product created', product_id, product_name, product_featured_image });
      logActivity({
        activityType: 'CREATE_SUCCESS',
        tableName: 'product',
        recordId: product_id,
        description: `Successfully created product: ${product_name}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: { product_id, product_name }
      });
    }
  );
});

app.get('/product', (req, res) => {
  const query = 'SELECT * FROM product ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product',
        description: 'Failed to fetch products',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch products', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product',
      description: 'Successfully fetched all products',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

// app.get('/fuel_vs_other_stock/current', (req, res) => {
//   const fuelCategoryId = 'afa9a93da602';
//   const fuelQuery = `
//     SELECT COALESCE(SUM(current_product_stock_qty_number), 0) AS total_fuel_product_count
//     FROM product
//     WHERE category_id = ?
//   `;
//   const otherQuery = `
//     SELECT COALESCE(SUM(current_product_stock_qty_number), 0) AS total_other_product_count
//     FROM product
//     WHERE category_id != ?
//   `;
//   Promise.all([
//     new Promise((resolve, reject) => {
//       connection.query(fuelQuery, [fuelCategoryId], (err, results) => {
//         if (err) return reject(err);
//         resolve(results[0].total_fuel_product_count);
//       });
//     }),
//     new Promise((resolve, reject) => {
//       connection.query(otherQuery, [fuelCategoryId], (err, results) => {
//         if (err) return reject(err);
//         resolve(results[0].total_other_product_count);
//       });
//     })
//   ])
//   .then(([total_fuel_product_count, total_other_product_count]) => {
//     res.status(200).json({
//       fuel_category_id: fuelCategoryId,
//       total_fuel_product_count: Number(total_fuel_product_count),
//       total_other_product_count: Number(total_other_product_count)
//     });
//   })
//   .catch(err => {
//     res.status(500).json({ error: 'Failed to fetch product counts', details: err.message });
//   });
// });


// app.get('/fuel_vs_other_stock/as_of', (req, res) => {
//   const fuelCategoryId = 'afa9a93da602';
//   const { as_of } = req.query; 
//   if (!as_of) return res.status(400).json({ error: 'as_of date required' });

//   const fuelQuery = `
//     SELECT COALESCE(SUM(CASE WHEN sm.adjustment_action='increase' THEN sm.size ELSE 0 END),0) -
//           COALESCE(SUM(CASE WHEN sm.adjustment_action='decrease' THEN sm.size ELSE 0 END),0) AS total_fuel_product_count
//     FROM stock_modify sm
//     JOIN product p ON sm.product_id = p.product_id
//     WHERE p.category_id = ? AND DATE(sm.date) <= ?
//   `;
//   const otherQuery = `
//     SELECT COALESCE(SUM(CASE WHEN sm.adjustment_action='increase' THEN sm.size ELSE 0 END),0) -
//           COALESCE(SUM(CASE WHEN sm.adjustment_action='decrease' THEN sm.size ELSE 0 END),0) AS total_other_product_count
//     FROM stock_modify sm
//     JOIN product p ON sm.product_id = p.product_id
//     WHERE p.category_id != ? AND DATE(sm.date) <= ?
//   `;

//   Promise.all([
//     new Promise((resolve, reject) => {
//       connection.query(fuelQuery, [fuelCategoryId, as_of], (err, results) => {
//         if (err) return reject(err);
//         resolve(results[0].total_fuel_product_count);
//       });
//     }),
//     new Promise((resolve, reject) => {
//       connection.query(otherQuery, [fuelCategoryId, as_of], (err, results) => {
//         if (err) return reject(err);
//         resolve(results[0].total_other_product_count);
//       });
//     })
//   ])
//   .then(([total_fuel_product_count, total_other_product_count]) => {
//     res.status(200).json({
//       fuel_category_id: fuelCategoryId,
//       total_fuel_product_count: Number(total_fuel_product_count),
//       total_other_product_count: Number(total_other_product_count)
//     });
//   })
//   .catch(err => {
//     res.status(500).json({ error: 'Failed to fetch product counts', details: err.message });
//   });
// });

// app.get('/fuel_vs_other_stock', (req, res) => {
//   const fuelCategoryId = 'afa9a93da602';
//   const { range, start, end } = req.query;
//   let dateFilter = '';
//   let params = [fuelCategoryId];

//   if (range === 'today') {
//     dateFilter = "AND DATE(created_at) = CURDATE()";
//   } else if (range === 'yesterday') {
//     dateFilter = "AND DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
//   } else if (range === 'last7days') {
//     dateFilter = "AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
//   } else if (range === 'thismonth') {
//     dateFilter = "AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())";
//   } else if (range === 'custom' && start && end) {
//     dateFilter = "AND DATE(created_at) BETWEEN ? AND ?";
//     params.push(start, end);
//   }

//   const fuelQuery = `
//     SELECT COALESCE(SUM(current_product_stock_qty_number), 0) AS total_fuel_product_count
//     FROM product
//     WHERE category_id = ? ${dateFilter}
//   `;
//   const otherQuery = `
//     SELECT COALESCE(SUM(current_product_stock_qty_number), 0) AS total_other_product_count
//     FROM product
//     WHERE category_id != ? ${dateFilter}
//   `;

//   Promise.all([
//     new Promise((resolve, reject) => {
//       connection.query(fuelQuery, params, (err, results) => {
//         if (err) return reject(err);
//         resolve(results[0].total_fuel_product_count);
//       });
//     }),
//     new Promise((resolve, reject) => {
//       connection.query(otherQuery, params, (err, results) => {
//         if (err) return reject(err);
//         resolve(results[0].total_other_product_count);
//       });
//     })
//   ])
//   .then(([total_fuel_product_count, total_other_product_count]) => {
//     res.status(200).json({
//       fuel_category_id: fuelCategoryId,
//       total_fuel_product_count: Number(total_fuel_product_count),
//       total_other_product_count: Number(total_other_product_count)
//     });
//   })
//   .catch(err => {
//     res.status(500).json({ error: 'Failed to fetch product counts', details: err.message });
//   });
// });

app.get('/fuel_vs_other_stock/current', async (req, res) => {
  try {
   
    const [fuelCatRows] = await connection.promise().query(
      "SELECT category_id FROM product_category WHERE LOWER(category_name) = 'fuel' LIMIT 1"
    );
    if (!fuelCatRows.length) {
      return res.status(404).json({ error: 'Fuel category not found' });
    }
    const fuelCategoryId = fuelCatRows[0].category_id;

    const fuelQuery = `
      SELECT COALESCE(SUM(current_product_stock_qty_number), 0) AS total_fuel_product_count
      FROM product
      WHERE category_id = ?
    `;
    const otherQuery = `
      SELECT COALESCE(SUM(current_product_stock_qty_number), 0) AS total_other_product_count
      FROM product
      WHERE category_id != ?
    `;

    const [[fuelResult], [otherResult]] = await Promise.all([
      connection.promise().query(fuelQuery, [fuelCategoryId]),
      connection.promise().query(otherQuery, [fuelCategoryId])
    ]);

    res.status(200).json({
      fuel_category_id: fuelCategoryId,
      total_fuel_product_count: Number(fuelResult[0].total_fuel_product_count),
      total_other_product_count: Number(otherResult[0].total_other_product_count)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product counts', details: err.message });
  }
});


app.get('/fuel_vs_other_stock', async (req, res) => {
  try {

    const [fuelCatRows] = await connection.promise().query(
      "SELECT category_id FROM product_category WHERE LOWER(category_name) = 'fuel' LIMIT 1"
    );
    if (!fuelCatRows.length) {
      return res.status(404).json({ error: 'Fuel category not found' });
    }
    const fuelCategoryId = fuelCatRows[0].category_id;

    const { range, start, end } = req.query;
    let dateFilter = '';
    let params = [fuelCategoryId];

    if (range === 'today') {
      dateFilter = "AND DATE(created_at) = CURDATE()";
    } else if (range === 'yesterday') {
      dateFilter = "AND DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
    } else if (range === 'last7days') {
      dateFilter = "AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
    } else if (range === 'thismonth') {
      dateFilter = "AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())";
    } else if (range === 'custom' && start && end) {
      dateFilter = "AND DATE(created_at) BETWEEN ? AND ?";
      params.push(start, end);
    }

    const fuelQuery = `
      SELECT COALESCE(SUM(current_product_stock_qty_number), 0) AS total_fuel_product_count
      FROM product
      WHERE category_id = ? ${dateFilter}
    `;
    const otherQuery = `
      SELECT COALESCE(SUM(current_product_stock_qty_number), 0) AS total_other_product_count
      FROM product
      WHERE category_id != ? ${dateFilter}
    `;

    const [[fuelResult], [otherResult]] = await Promise.all([
      connection.promise().query(fuelQuery, params),
      connection.promise().query(otherQuery, params)
    ]);

    res.status(200).json({
      fuel_category_id: fuelCategoryId,
      total_fuel_product_count: Number(fuelResult[0].total_fuel_product_count),
      total_other_product_count: Number(otherResult[0].total_other_product_count)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product counts', details: err.message });
  }
});

app.get('/fuel_vs_other_stock/as_of', async (req, res) => {
  try {
    const [fuelCatRows] = await connection.promise().query(
      "SELECT category_id FROM product_category WHERE LOWER(category_name) = 'fuel' LIMIT 1"
    );
    if (!fuelCatRows.length) {
      return res.status(404).json({ error: 'Fuel category not found' });
    }
    const fuelCategoryId = fuelCatRows[0].category_id;

    const { as_of } = req.query;
    if (!as_of) return res.status(400).json({ error: 'as_of date required' });

    const fuelQuery = `
      SELECT COALESCE(SUM(CASE WHEN sm.adjustment_action='increase' THEN sm.size ELSE 0 END),0) -
             COALESCE(SUM(CASE WHEN sm.adjustment_action='decrease' THEN sm.size ELSE 0 END),0) AS total_fuel_product_count
      FROM stock_modify sm
      JOIN product p ON sm.product_id = p.product_id
      WHERE p.category_id = ? AND DATE(sm.date) <= ?
    `;
    const otherQuery = `
      SELECT COALESCE(SUM(CASE WHEN sm.adjustment_action='increase' THEN sm.size ELSE 0 END),0) -
             COALESCE(SUM(CASE WHEN sm.adjustment_action='decrease' THEN sm.size ELSE 0 END),0) AS total_other_product_count
      FROM stock_modify sm
      JOIN product p ON sm.product_id = p.product_id
      WHERE p.category_id != ? AND DATE(sm.date) <= ?
    `;

    const [[fuelResult], [otherResult]] = await Promise.all([
      connection.promise().query(fuelQuery, [fuelCategoryId, as_of]),
      connection.promise().query(otherQuery, [fuelCategoryId, as_of])
    ]);

    res.status(200).json({
      fuel_category_id: fuelCategoryId,
      total_fuel_product_count: Number(fuelResult[0].total_fuel_product_count),
      total_other_product_count: Number(otherResult[0].total_other_product_count)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product counts', details: err.message });
  }
});

app.get('/product/:product_id', (req, res) => {
  const { product_id } = req.params;
  const query = 'SELECT * FROM product WHERE product_id = ?';
  connection.query(query, [product_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product',
        recordId: product_id,
        description: 'Failed to fetch product by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch product', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product',
        recordId: product_id,
        description: 'Product not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Product not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'product',
      recordId: product_id,
      description: 'Fetched product by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.get('/product/category/:category_id', (req, res) => {
  const { category_id } = req.params;
  const query = 'SELECT * FROM product WHERE category_id = ? ORDER BY created_at DESC';
  connection.query(query, [category_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product',
        description: 'Failed to fetch products by category_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch products', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product',
      description: `Fetched all products for category_id ${category_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, category_id }
    });
    res.status(200).json(results);
  });
});

app.get('/product/supplier/:supplier_id', (req, res) => {
  const { supplier_id } = req.params;
  const query = 'SELECT * FROM product WHERE supplier_id = ? ORDER BY created_at DESC';
  connection.query(query, [supplier_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product',
        description: 'Failed to fetch products by supplier_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch products', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product',
      description: `Fetched all products for supplier_id ${supplier_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, supplier_id }
    });
    res.status(200).json(results);
  });
});

app.get('/product/unit/:unit_id', (req, res) => {
  const { unit_id } = req.params;
  const query = 'SELECT * FROM product WHERE unit_id = ? ORDER BY created_at DESC';
  connection.query(query, [unit_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product',
        description: 'Failed to fetch products by unit_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch products', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product',
      description: `Fetched all products for unit_id ${unit_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, unit_id }
    });
    res.status(200).json(results);
  });
});

app.patch('/product/:product_id', upload.single('product_featured_image'), (req, res) => {
  const { product_id } = req.params;
  const {
    product_name,
    category_name,
    category_id,
    brand,
    unit_name,
    product_alert_limit,
    product_description,
    current_product_stock_qty_number
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (product_name) { updateFields.push('product_name = ?'); updateValues.push(product_name); }
  if (category_name) { updateFields.push('category_name = ?'); updateValues.push(category_name); }
  if (category_id) { updateFields.push('category_id = ?'); updateValues.push(category_id); }
  if (brand) { updateFields.push('brand = ?'); updateValues.push(brand); }
  if (unit_name) { updateFields.push('unit_name = ?'); updateValues.push(unit_name); }
  if (product_alert_limit !== undefined) { updateFields.push('product_alert_limit = ?'); updateValues.push(product_alert_limit); }
  if (product_description) { updateFields.push('product_description = ?'); updateValues.push(product_description); }
   if (current_product_stock_qty_number !== undefined) { 
    updateFields.push('current_product_stock_qty_number = ?');
    updateValues.push(current_product_stock_qty_number);
  }
  if (req.file) {
    updateFields.push('product_featured_image = ?');
    updateValues.push(req.file.filename);
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE product SET ${updateFields.join(', ')} WHERE product_id = ?`;
  updateValues.push(product_id);

   console.log('PATCH PRODUCT:', { query, updateValues });

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product',
        recordId: product_id,
        description: 'Failed to update product',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update product', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product',
        recordId: product_id,
        description: 'Product not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Product not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'product',
      recordId: product_id,
      description: 'Updated product',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { product_id }
    });
    res.status(200).json({ message: 'Product updated', product_id });
  });
});

app.delete('/product/:product_id', (req, res) => {
  const { product_id } = req.params;
  connection.query('DELETE FROM order_details WHERE product_id = ?', [product_id], () => {
    connection.query('DELETE FROM product_order WHERE product_id = ?', [product_id], () => {
      connection.query('DELETE FROM stock_modify WHERE product_id = ?', [product_id], () => {
     
        connection.query('SELECT variations_id FROM product_variations WHERE product_id = ?', [product_id], (err, variations) => {
          if (err) {
            logActivity({
              activityType: 'DB_ERROR',
              tableName: 'product',
              recordId: product_id,
              description: 'Failed to fetch product variations for deletion',
              performedById: req.session?.userId || 'unknown',
              performedByRole: req.session?.userRole || 'unknown',
              req,
              significance: 'high',
              metadata: { error: err.message }
            });
            return res.status(500).json({ error: 'Failed to delete product', details: err.message });
          }
          const variationIds = variations.map(v => v.variations_id);
          let count = 0;
          if (variationIds.length === 0) {
           
            connection.query('DELETE FROM product WHERE product_id = ?', [product_id], (err, result) => {
              if (err) {
                logActivity({
                  activityType: 'DB_ERROR',
                  tableName: 'product',
                  recordId: product_id,
                  description: 'Failed to delete product',
                  performedById: req.session?.userId || 'unknown',
                  performedByRole: req.session?.userRole || 'unknown',
                  req,
                  significance: 'high',
                  metadata: { error: err.message }
                });
                return res.status(500).json({ error: 'Failed to delete product', details: err.message });
              }
              if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Product not found' });
              }
              logActivity({
                activityType: 'DELETE_SUCCESS',
                tableName: 'product',
                recordId: product_id,
                description: 'Deleted product',
                performedById: req.session?.userId || 'unknown',
                performedByRole: req.session?.userRole || 'unknown',
                req,
                significance: 'medium',
                metadata: {}
              });
              res.status(200).json({ message: 'Product deleted', product_id });
            });
            return;
          }
          variationIds.forEach(vid => {
            connection.query('DELETE FROM variation_attributes WHERE variations_id = ?', [vid], () => {
              connection.query('DELETE FROM stock_modify WHERE variations_id = ?', [vid], () => {
                connection.query('DELETE FROM product_order WHERE variations_id = ?', [vid], () => {
                  connection.query('DELETE FROM order_details WHERE variations_id = ?', [vid], () => {
                    connection.query('DELETE FROM product_variations WHERE variations_id = ?', [vid], () => {
                      count++;
                      if (count === variationIds.length) {
                      
                        connection.query('DELETE FROM product WHERE product_id = ?', [product_id], (err, result) => {
                          if (err) {
                            logActivity({
                              activityType: 'DB_ERROR',
                              tableName: 'product',
                              recordId: product_id,
                              description: 'Failed to delete product',
                              performedById: req.session?.userId || 'unknown',
                              performedByRole: req.session?.userRole || 'unknown',
                              req,
                              significance: 'high',
                              metadata: { error: err.message }
                            });
                            return res.status(500).json({ error: 'Failed to delete product', details: err.message });
                          }
                          if (result.affectedRows === 0) {
                            return res.status(404).json({ error: 'Product not found' });
                          }
                          logActivity({
                            activityType: 'DELETE_SUCCESS',
                            tableName: 'product',
                            recordId: product_id,
                            description: 'Deleted product',
                            performedById: req.session?.userId || 'unknown',
                            performedByRole: req.session?.userRole || 'unknown',
                            req,
                            significance: 'medium',
                            metadata: {}
                          });
                          res.status(200).json({ message: 'Product and all related variations deleted', product_id });
                        });
                      }
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});


app.get('/product-data', (req, res) => {

   const { range, start, end } = req.query;
  let as_of = null;
  if (range === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    as_of = yesterday.toISOString().slice(0, 10);
  } else if (range === 'custom' && end) {
    as_of = end;
  } else if (range === 'today' || range === 'last7days' || range === 'thismonth') {
    as_of = new Date().toISOString().slice(0, 10);
  }


  logActivity({
    activityType: 'FETCH_PRODUCT_DATA',
    tableName: 'product',
    description: `Fetching product data with range: ${range}, start: ${start}, end: ${end}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { range, start, end }
  });


  const topProductsQuery = `
    SELECT product_id, product_name, current_product_stock_qty_number
    FROM product
    ORDER BY current_product_stock_qty_number DESC
    LIMIT 2
  `;

const lowStockQuery = `
  SELECT COUNT(*) AS low_stock_count
  FROM product_variations
  WHERE current_variations_stock_qty_number <= stock_qty_alert_level
    AND stock_qty_alert_level > 0
`;

  const outOfStockQuery = `
    SELECT COUNT(*) AS out_of_stock_count
     FROM product_variations
    WHERE current_variations_stock_qty_number = 0
  `;
 
let inventoryValueQuery, potentialSalesValueQuery;
  if (as_of) {
    inventoryValueQuery = `
      SELECT 
        SUM(
          pv.cost_price *
          (
            pv.opening_stock_qty
            + COALESCE((
              SELECT SUM(CASE WHEN sm.adjustment_action='increase' THEN sm.size ELSE 0 END)
              FROM stock_modify sm
              WHERE sm.variations_id = pv.variations_id AND DATE(sm.date) <= '${as_of}'
            ), 0)
            - COALESCE((
              SELECT SUM(CASE WHEN sm.adjustment_action='decrease' THEN sm.size ELSE 0 END)
              FROM stock_modify sm
              WHERE sm.variations_id = pv.variations_id AND DATE(sm.date) <= '${as_of}'
            ), 0)
          )
        ) AS inventory_value
      FROM product_variations pv
    `;
    potentialSalesValueQuery = `
      SELECT 
        SUM(
          pv.selling_price *
          (
            pv.opening_stock_qty
            + COALESCE((
              SELECT SUM(CASE WHEN sm.adjustment_action='increase' THEN sm.size ELSE 0 END)
              FROM stock_modify sm
              WHERE sm.variations_id = pv.variations_id AND DATE(sm.date) <= '${as_of}'
            ), 0)
            - COALESCE((
              SELECT SUM(CASE WHEN sm.adjustment_action='decrease' THEN sm.size ELSE 0 END)
              FROM stock_modify sm
              WHERE sm.variations_id = pv.variations_id AND DATE(sm.date) <= '${as_of}'
            ), 0)
          )
        ) AS potential_sales_value
      FROM product_variations pv
    `;
  } else {
    inventoryValueQuery = `
      SELECT COALESCE(SUM(cost_price * current_variations_stock_qty_number),0) AS inventory_value
      FROM product_variations
    `;
    potentialSalesValueQuery = `
      SELECT COALESCE(SUM(selling_price * current_variations_stock_qty_number),0) AS potential_sales_value
      FROM product_variations
    `;
  }

  logActivity({
    activityType: 'FETCH_PRODUCT_DATA_QUERIES',
    tableName: 'product',
    description: 'Executing queries for product data',
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {
      topProductsQuery,
      lowStockQuery,
      outOfStockQuery,
      inventoryValueQuery,
      potentialSalesValueQuery
    }
  })

  Promise.all([
    new Promise((resolve, reject) => {
      connection.query(topProductsQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    }),
    new Promise((resolve, reject) => {
      connection.query(lowStockQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].low_stock_count);
      });
    }),
    new Promise((resolve, reject) => {
      connection.query(outOfStockQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].out_of_stock_count);
      });
    }),
    new Promise((resolve, reject) => {
      connection.query(inventoryValueQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].inventory_value);
      });
    }),
    new Promise((resolve, reject) => {
      connection.query(potentialSalesValueQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].potential_sales_value);
      });
    }),
  ])
  .then(([topProducts, lowStockCount, outOfStockCount, inventoryValue, potentialSalesValue]) => {
    res.status(200).json({
      top_products: topProducts,
      low_stock_count: lowStockCount,
      out_of_stock_count: outOfStockCount,
      inventory_value: Number(inventoryValue),
      potential_sales_value: Number(potentialSalesValue)
    });
  })
  .catch(err => {
    res.status(500).json({ error: 'Failed to fetch product data', details: err.message });
    logActivity({
      activityType: 'FETCH_PRODUCT_DATA_ERROR',
      tableName: 'product',
      description: 'Error fetching product data',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'high',
      metadata: { error: err.message, range, start, end }
    })
  });
});

// app.get('/product-data/:product_id', (req, res) => {
//   const { product_id } = req.params;
//   const { range, start, end } = req.query;

//   if (!product_id) {
//     return res.status(400).json({ error: 'Product ID is required' });
//   }

// let as_of = null;
// let start_date = null;

// if (range === 'yesterday') {
//   const yesterday = new Date();
//   yesterday.setDate(yesterday.getDate() - 1);
//   as_of = yesterday.toISOString().slice(0, 10);
// } else if (range === 'custom' && start && end) {
//   start_date = start;
//   as_of = end;
// } else if (range === 'last7days') {
//   const today = new Date();
//     const yesterday = new Date();
//   yesterday.setDate(today.getDate() - 1);
//   const sevenDaysAgo = new Date();
//   sevenDaysAgo.setDate(today.getDate() - 7);
//   start_date = sevenDaysAgo.toISOString().slice(0, 10);
//   as_of = yesterday.toISOString().slice(0, 10);
// } else {
//   as_of = new Date().toISOString().slice(0, 10);
// }

// let variationsQuery, variationParams, stockQuery, stockParams;

// if (start_date && as_of) {
 
//   variationsQuery = `
//     SELECT 
//       COUNT(*) AS product_variation_number,
//       SUM(
//         pv.cost_price * (
//           pv.opening_stock_qty +
//           COALESCE((
//             SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
//             FROM stock_modify sm
//             WHERE sm.variations_id = pv.variations_id
//             AND DATE(sm.date) <= ?
//           ), 0) -
//           COALESCE((
//             SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
//             FROM stock_modify sm
//             WHERE sm.variations_id = pv.variations_id
//             AND DATE(sm.date) <= ?
//           ), 0)
//         )
//       ) AS inventory_value,
//       SUM(
//         pv.selling_price * (
//           pv.opening_stock_qty +
//           COALESCE((
//             SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
//             FROM stock_modify sm
//             WHERE sm.variations_id = pv.variations_id
//             AND DATE(sm.date) <= ?
//           ), 0) -
//           COALESCE((
//             SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
//             FROM stock_modify sm
//             WHERE sm.variations_id = pv.variations_id
//             AND DATE(sm.date) <= ?
//           ), 0)
//         )
//       ) AS potential_sale_value
//     FROM product_variations pv
//     WHERE pv.product_id = ?
//       AND DATE(pv.created_at) <= ?
//   `;
//   variationParams = [as_of, as_of, as_of, as_of, product_id, as_of];

//   stockQuery = `
//     SELECT 
//       COALESCE(SUM(
//         pv.opening_stock_qty +
//         COALESCE((
//           SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
//           FROM stock_modify sm
//           WHERE sm.variations_id = pv.variations_id
//           AND DATE(sm.date) <= ?
//         ), 0) -
//         COALESCE((
//           SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
//           FROM stock_modify sm
//           WHERE sm.variations_id = pv.variations_id
//           AND DATE(sm.date) <= ?
//         ), 0)
//       ), 0) AS total_stock
//     FROM product_variations pv
//     WHERE pv.product_id = ?
//       AND DATE(pv.created_at) <= ?
//   `;
//   stockParams = [as_of, as_of, product_id, as_of];
// } else if (as_of) {
//   // Stock as of a date
//   variationsQuery = `
//     SELECT 
//       COUNT(*) AS product_variation_number,
//       SUM(
//         pv.cost_price * (
//           pv.opening_stock_qty +
//           COALESCE((
//             SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
//             FROM stock_modify sm
//             WHERE sm.variations_id = pv.variations_id
//             AND DATE(sm.date) <= ?
//           ), 0) -
//           COALESCE((
//             SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
//             FROM stock_modify sm
//             WHERE sm.variations_id = pv.variations_id
//             AND DATE(sm.date) <= ?
//           ), 0)
//         )
//       ) AS inventory_value,
//       SUM(
//         pv.selling_price * (
//           pv.opening_stock_qty +
//           COALESCE((
//             SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
//             FROM stock_modify sm
//             WHERE sm.variations_id = pv.variations_id
//             AND DATE(sm.date) <= ?
//           ), 0) -
//           COALESCE((
//             SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
//             FROM stock_modify sm
//             WHERE sm.variations_id = pv.variations_id
//             AND DATE(sm.date) <= ?
//           ), 0)
//         )
//       ) AS potential_sale_value
//     FROM product_variations pv
//     WHERE pv.product_id = ?
//       AND DATE(pv.created_at) <= ?
//   `;
//   variationParams = [as_of, as_of, as_of, as_of, product_id, as_of];

//   stockQuery = `
//     SELECT 
//       COALESCE(SUM(
//         pv.opening_stock_qty +
//         COALESCE((
//           SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
//           FROM stock_modify sm
//           WHERE sm.variations_id = pv.variations_id
//           AND DATE(sm.date) <= ?
//         ), 0) -
//         COALESCE((
//           SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
//           FROM stock_modify sm
//           WHERE sm.variations_id = pv.variations_id
//           AND DATE(sm.date) <= ?
//         ), 0)
//       ), 0) AS total_stock
//     FROM product_variations pv
//     WHERE pv.product_id = ?
//       AND DATE(pv.created_at) <= ?
//   `;
//   stockParams = [as_of, as_of, product_id, as_of];
// } else {
//   // Current
//   variationsQuery = `
//     SELECT 
//       COUNT(*) AS product_variation_number,
//       COALESCE(SUM(cost_price * current_variations_stock_qty_number), 0) AS inventory_value,
//       COALESCE(SUM(selling_price * current_variations_stock_qty_number), 0) AS potential_sale_value
//     FROM product_variations
//     WHERE product_id = ?
//   `;
//   variationParams = [product_id];

//   stockQuery = `
//     SELECT current_product_stock_qty_number AS total_stock
//     FROM product
//     WHERE product_id = ?
//     LIMIT 1
//   `;
//   stockParams = [product_id];
// }

//   logActivity({
//     activityType: 'FETCH_PRODUCT_DATA',
//     tableName: 'product_variations',
//     recordId: product_id,
//     description: `Fetching product data with optional range: ${range}`,
//     performedById: req.session?.userId || 'unknown',
//     performedByRole: req.session?.userRole || 'unknown',
//     req,
//     significance: 'medium',
//     metadata: { product_id, range, start, end }
//   });

//   connection.query(variationsQuery, variationParams, (err, variationsResult) => {
//     if (err) {
//       return res.status(500).json({ error: 'Failed to fetch variation data', details: err.message });
//     }

//     connection.query(stockQuery, stockParams, (err2, stockResult) => {
//       if (err2) {
//         return res.status(500).json({ error: 'Failed to fetch stock data', details: err2.message });
//       }

//       if (!stockResult.length) {
//         return res.status(404).json({ error: 'Product not found' });
//       }

//       const { product_variation_number, inventory_value, potential_sale_value } = variationsResult[0];
//       const { total_stock } = stockResult[0];

//       res.status(200).json({
//         product_variation_number: Number(product_variation_number) || 0,
//         total_stock: Number(total_stock) || 0,
//         inventory_value: Number(inventory_value) || 0,
//         potential_sale_value: Number(potential_sale_value) || 0
//       });

//       logActivity({
//         activityType: 'FETCH_PRODUCT_DATA_RESPONSE',
//         tableName: 'product',
//         recordId: product_id,
//         description: `Returned product metrics`,
//         performedById: req.session?.userId || 'unknown',
//         performedByRole: req.session?.userRole || 'unknown',
//         req,
//         significance: 'medium',
//         metadata: {
//           product_id,
//           range,
//           inventory_value,
//           potential_sale_value,
//           total_stock
//         }
//       });
//     });
//   });
// });
app.get('/product-data/:product_id', (req, res) => {
  const { product_id } = req.params;
  const { range, start, end } = req.query;

  if (!product_id) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

let as_of = null;
let start_date = null;

if (range === 'yesterday') {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  as_of = yesterday.toISOString().slice(0, 10);
} else if (range === 'custom' && start && end) {
  start_date = start;
  as_of = end;
} else if (range === 'last7days') {
  const today = new Date();
    const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);
  start_date = sevenDaysAgo.toISOString().slice(0, 10);
  as_of = yesterday.toISOString().slice(0, 10);
} else {
  as_of = new Date().toISOString().slice(0, 10);
}

let variationsQuery, variationParams, stockQuery, stockParams;

if (start_date && as_of) {
 
  variationsQuery = `
    SELECT 
      COUNT(*) AS product_variation_number,
      SUM(
        pv.cost_price * (
          COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id
            AND DATE(sm.date) <= ?
          ), 0) -
          COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id
            AND DATE(sm.date) <= ?
          ), 0)
        )
      ) AS inventory_value,
      SUM(
        pv.selling_price * (
          COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id
            AND DATE(sm.date) <= ?
          ), 0) -
          COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id
            AND DATE(sm.date) <= ?
          ), 0)
        )
      ) AS potential_sale_value
    FROM product_variations pv
    WHERE pv.product_id = ?
      AND DATE(pv.created_at) <= ?
  `;
  variationParams = [as_of, as_of, as_of, as_of, product_id, as_of];

  stockQuery = `
    SELECT 
      COALESCE(SUM(
        COALESCE((
          SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
          FROM stock_modify sm
          WHERE sm.variations_id = pv.variations_id
          AND DATE(sm.date) <= ?
        ), 0) -
        COALESCE((
          SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
          FROM stock_modify sm
          WHERE sm.variations_id = pv.variations_id
          AND DATE(sm.date) <= ?
        ), 0)
      ), 0) AS total_stock
    FROM product_variations pv
    WHERE pv.product_id = ?
      AND DATE(pv.created_at) <= ?
  `;
  stockParams = [as_of, as_of, product_id, as_of];
} else if (as_of) {
  // Stock as of a date
  variationsQuery = `
    SELECT 
      COUNT(*) AS product_variation_number,
      SUM(
        pv.cost_price * (
          COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id
            AND DATE(sm.date) <= ?
          ), 0) -
          COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id
            AND DATE(sm.date) <= ?
          ), 0)
        )
      ) AS inventory_value,
      SUM(
        pv.selling_price * (
          COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id
            AND DATE(sm.date) <= ?
          ), 0) -
          COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id
            AND DATE(sm.date) <= ?
          ), 0)
        )
      ) AS potential_sale_value
    FROM product_variations pv
    WHERE pv.product_id = ?
      AND DATE(pv.created_at) <= ?
  `;
  variationParams = [as_of, as_of, as_of, as_of, product_id, as_of];

  stockQuery = `
    SELECT 
      COALESCE(SUM(
        COALESCE((
          SELECT SUM(CASE WHEN sm.adjustment_action = 'increase' THEN sm.size ELSE 0 END)
          FROM stock_modify sm
          WHERE sm.variations_id = pv.variations_id
          AND DATE(sm.date) <= ?
        ), 0) -
        COALESCE((
          SELECT SUM(CASE WHEN sm.adjustment_action = 'decrease' THEN sm.size ELSE 0 END)
          FROM stock_modify sm
          WHERE sm.variations_id = pv.variations_id
          AND DATE(sm.date) <= ?
        ), 0)
      ), 0) AS total_stock
    FROM product_variations pv
    WHERE pv.product_id = ?
      AND DATE(pv.created_at) <= ?
  `;
  stockParams = [as_of, as_of, product_id, as_of];
} else {
  // Current
  variationsQuery = `
    SELECT 
      COUNT(*) AS product_variation_number,
      COALESCE(SUM(cost_price * current_variations_stock_qty_number), 0) AS inventory_value,
      COALESCE(SUM(selling_price * current_variations_stock_qty_number), 0) AS potential_sale_value
    FROM product_variations
    WHERE product_id = ?
  `;
  variationParams = [product_id];

  stockQuery = `
    SELECT current_product_stock_qty_number AS total_stock
    FROM product
    WHERE product_id = ?
    LIMIT 1
  `;
  stockParams = [product_id];
}

  logActivity({
    activityType: 'FETCH_PRODUCT_DATA',
    tableName: 'product_variations',
    recordId: product_id,
    description: `Fetching product data with optional range: ${range}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { product_id, range, start, end }
  });

  connection.query(variationsQuery, variationParams, (err, variationsResult) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch variation data', details: err.message });
    }

    connection.query(stockQuery, stockParams, (err2, stockResult) => {
      if (err2) {
        return res.status(500).json({ error: 'Failed to fetch stock data', details: err2.message });
      }

      if (!stockResult.length) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const { product_variation_number, inventory_value, potential_sale_value } = variationsResult[0];
      const { total_stock } = stockResult[0];

      res.status(200).json({
        product_variation_number: Number(product_variation_number) || 0,
        total_stock: Number(total_stock) || 0,
        inventory_value: Number(inventory_value) || 0,
        potential_sale_value: Number(potential_sale_value) || 0
      });

      logActivity({
        activityType: 'FETCH_PRODUCT_DATA_RESPONSE',
        tableName: 'product',
        recordId: product_id,
        description: `Returned product metrics`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {
          product_id,
          range,
          inventory_value,
          potential_sale_value,
          total_stock
        }
      });
    });
  });
});

// app.get('/product-data/:product_id', async (req, res) => {
//   const { product_id } = req.params;
//   const { range, start, end } = req.query;

//   if (!product_id) {
//     return res.status(400).json({ error: 'Product ID is required' });
//   }


//   let dateFilter = '';
//   let params = [product_id];
//   if (range === 'yesterday') {
//     dateFilter = "AND DATE(sm.date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
//   } else if (range === 'last7days') {
//     dateFilter = "AND DATE(sm.date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
//   } else if (range === 'custom' && start && end) {
//     dateFilter = "AND DATE(sm.date) BETWEEN ? AND ?";
//     params.push(start, end);
//   } else if (range === 'today') {
//     dateFilter = "AND DATE(sm.date) = CURDATE()";
//   }

 
//   const variationsQuery = `
//     SELECT variations_id, cost_price, selling_price, product_name
//     FROM product_variations
//     WHERE product_id = ?
//   `;
//   const [variations] = await connection.promise().query(variationsQuery, [product_id]);
//   if (!variations.length) {
//     return res.status(404).json({ error: 'Product not found or no variations' });
//   }

  
//   let total_stock = 0, inventory_value = 0, potential_sale_value = 0;
//   for (const v of variations) {
//     const stockFlowQuery = `
//       SELECT
//         SUM(CASE WHEN adjustment_action = 'increase' THEN size ELSE 0 END) AS total_increase,
//         SUM(CASE WHEN adjustment_action = 'decrease' THEN size ELSE 0 END) AS total_decrease
//       FROM stock_modify sm
//       WHERE sm.variations_id = ?
//       ${dateFilter}
//     `;
//     const stockParams = [v.variations_id, ...params.slice(1)];
//     const [[flow]] = await connection.promise().query(stockFlowQuery, stockParams);

//     const netStock = (Number(flow.total_increase) || 0) - (Number(flow.total_decrease) || 0);
//     total_stock += netStock;
//     inventory_value += netStock * (Number(v.cost_price) || 0);
//     potential_sale_value += netStock * (Number(v.selling_price) || 0);
//   }

//   res.status(200).json({
//     product_variation_number: variations.length,
//     total_stock: total_stock,
//     inventory_value: inventory_value,
//     potential_sale_value: potential_sale_value
//   });

//   logActivity({
//     activityType: 'FETCH_PRODUCT_DATA_RESPONSE',
//     tableName: 'product',
//     recordId: product_id,
//     description: `Returned product metrics (stock flow by stock_modify)`,
//     performedById: req.session?.userId || 'unknown',
//     performedByRole: req.session?.userRole || 'unknown',
//     req,
//     significance: 'medium',
//     metadata: {
//       product_id,
//       range,
//       inventory_value,
//       potential_sale_value,
//       total_stock
//     }
//   });
// });

// app.get('/product-data/:product_id', (req, res) => {
//   const { product_id } = req.params;
//   const { range, start, end } = req.query;

//   if (!product_id) {
//     return res.status(400).json({ error: 'Product ID is required' });
//   }

 
//   const variationsQuery = `
//     SELECT 
//       COUNT(*) AS product_variation_number,
//       COALESCE(SUM(cost_price * current_variations_stock_qty_number), 0) AS inventory_value,
//       COALESCE(SUM(selling_price * current_variations_stock_qty_number), 0) AS potential_sale_value,
//       COALESCE(SUM(current_variations_stock_qty_number), 0) AS total_stock
//     FROM product_variations
//     WHERE product_id = ?
//   `;
//   const variationParams = [product_id];

//   logActivity({
//     activityType: 'FETCH_PRODUCT_DATA',
//     tableName: 'product_variations',
//     recordId: product_id,
//     description: `Fetching product data (current stock only)`,
//     performedById: req.session?.userId || 'unknown',
//     performedByRole: req.session?.userRole || 'unknown',
//     req,
//     significance: 'medium',
//     metadata: { product_id, range, start, end }
//   });

//   connection.query(variationsQuery, variationParams, (err, variationsResult) => {
//     if (err) {
//       return res.status(500).json({ error: 'Failed to fetch variation data', details: err.message });
//     }

//     if (!variationsResult.length) {
//       return res.status(404).json({ error: 'Product not found' });
//     }

//     const { product_variation_number, inventory_value, potential_sale_value, total_stock } = variationsResult[0];

//     res.status(200).json({
//       product_variation_number: Number(product_variation_number) || 0,
//       total_stock: Number(total_stock) || 0,
//       inventory_value: Number(inventory_value) || 0,
//       potential_sale_value: Number(potential_sale_value) || 0
//     });

//     logActivity({
//       activityType: 'FETCH_PRODUCT_DATA_RESPONSE',
//       tableName: 'product',
//       recordId: product_id,
//       description: `Returned product metrics (current stock only)`,
//       performedById: req.session?.userId || 'unknown',
//       performedByRole: req.session?.userRole || 'unknown',
//       req,
//       significance: 'medium',
//       metadata: {
//         product_id,
//         range,
//         inventory_value,
//         potential_sale_value,
//         total_stock
//       }
//     });
//   });
// });



app.get('/product_graph/:product_id', (req, res) => {
  const { product_id } = req.params;

  const variationsQuery = `
    SELECT variations_id, product_name, created_at, opening_stock_qty, current_variations_stock_qty_number
    FROM product_variations
    WHERE product_id = ?
    ORDER BY created_at ASC
  `;

  connection.query(variationsQuery, [product_id], (err, variations) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch product variations', details: err.message });
    }
    if (!variations.length) {
      return res.status(404).json({ error: 'No variations found for this product' });
    }

    let processed = 0;
    const result = [];

    variations.forEach(variation => {
      const { variations_id, product_name, created_at, opening_stock_qty } = variation;
      const attributesQuery = `
        SELECT a.attribute_name, av.value
        FROM variation_attributes va
        JOIN attribute a ON va.attribute_id = a.attribute_id
        JOIN attribute_values av ON va.value_id = av.value_id
        WHERE va.variations_id = ?
      `;
      const stockModsQuery = `
        SELECT date, adjustment_action, size
        FROM stock_modify
        WHERE variations_id = ?
        ORDER BY date ASC
      `;

     
      connection.query(attributesQuery, [variations_id], (attrErr, attrResults) => {
        let attrLabel = '';
        if (!attrErr && attrResults.length > 0) {
          attrLabel = attrResults.map(a => a.value).join(' - ');
        }
       
        let trajectory = [];
        let stock_movements = [];
        let currentStock = Number(opening_stock_qty) || 0;
        let lastTime = created_at;

        connection.query(stockModsQuery, [variations_id], (err, mods) => {
          if (err) {
            result.push({
              variations_id,
              error: 'Failed to fetch stock modifications',
              details: err.message
            });
          } else {
            trajectory.push({
              time: lastTime,
              stock: currentStock
            });
            stock_movements.push({
              time: lastTime,
              size: 0
            });

            mods.forEach(mod => {
              let qty = Number(mod.size) || 0;
              let movement = 0;
              if (mod.adjustment_action === 'increase') {
                currentStock += qty;
                movement = qty;
              } else if (mod.adjustment_action === 'decrease') {
                currentStock -= qty;
                movement = -qty;
              }
              trajectory.push({
                time: mod.date,
                stock: currentStock
              });
              stock_movements.push({
                time: mod.date,
                size: movement
              });
            });
            result.push({
              variations_id,
              product_name,
              variation_label: attrLabel ? `${product_name} - ${attrLabel}` : product_name,
              trajectory,
              stock_movements
            });
          }
          processed++;
          if (processed === variations.length) {
            res.status(200).json({
              product_id,
              variations: result
            });
          }
        });
      });
    });
  });
});


app.get('/stock_data_category', (req, res) => {
  const { as_of, start, end } = req.query;
  let query, params = [];

  if (as_of) {
    query = `
      SELECT 
        pc.category_id, 
        pc.category_name, 
        COALESCE(SUM(
          COALESCE(pv.opening_stock_qty, 0)
          + COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action='increase' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id AND DATE(sm.date) <= ?
          ), 0)
          - COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action='decrease' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id AND DATE(sm.date) <= ?
          ), 0)
        ), 0) AS total_stock,
        GROUP_CONCAT(DISTINCT p.unit_name ORDER BY p.unit_name SEPARATOR ', ') AS unit_names
      FROM product_category pc
      LEFT JOIN product p ON pc.category_id = p.category_id
      LEFT JOIN product_variations pv ON p.product_id = pv.product_id
      GROUP BY pc.category_id, pc.category_name
      ORDER BY pc.category_name ASC
    `;
    params = [as_of, as_of];
  } else if (start && end) {

    query = `
      SELECT 
        pc.category_id, 
        pc.category_name, 
        COALESCE(SUM(
          COALESCE(pv.opening_stock_qty, 0)
          + COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action='increase' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id AND DATE(sm.date) <= ?
          ), 0)
          - COALESCE((
            SELECT SUM(CASE WHEN sm.adjustment_action='decrease' THEN sm.size ELSE 0 END)
            FROM stock_modify sm
            WHERE sm.variations_id = pv.variations_id AND DATE(sm.date) <= ?
          ), 0)
        ), 0) AS total_stock,
        GROUP_CONCAT(DISTINCT p.unit_name ORDER BY p.unit_name SEPARATOR ', ') AS unit_names
      FROM product_category pc
      LEFT JOIN product p ON pc.category_id = p.category_id
      LEFT JOIN product_variations pv ON p.product_id = pv.product_id
      GROUP BY pc.category_id, pc.category_name
      ORDER BY pc.category_name ASC
    `;
    params = [end, end];
  } else {
    query = `
      SELECT 
        pc.category_id, 
        pc.category_name, 
        COALESCE(SUM(pv.current_variations_stock_qty_number), 0) AS total_stock,
        GROUP_CONCAT(DISTINCT p.unit_name ORDER BY p.unit_name SEPARATOR ', ') AS unit_names
      FROM product_category pc
      LEFT JOIN product p ON pc.category_id = p.category_id
      LEFT JOIN product_variations pv ON p.product_id = pv.product_id
      GROUP BY pc.category_id, pc.category_name
      ORDER BY pc.category_name ASC
    `;
  }

  connection.query(query, params, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_category',
        description: 'Failed to fetch stock data by category',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch stock data by category', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_category',
      description: 'Fetched stock data by category',
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});


app.get('/product_red', (req, res) => {
  const { filter } = req.query; 
  let where = '';
  let params = [];

  if (filter === 'out_of_stock') {
    where = 'WHERE current_variations_stock_qty_number = 0';
  } else if (filter === 'low_stock') {
    where = 'WHERE current_variations_stock_qty_number > 0 AND current_variations_stock_qty_number <= stock_qty_alert_level';
  } else {
 
    where = 'WHERE current_variations_stock_qty_number <= stock_qty_alert_level';
  }

  const query = `
    SELECT *
    FROM product_variations
    ${where}
    ORDER BY current_variations_stock_qty_number ASC
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_variations',
        description: 'Failed to fetch red zone variations',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch red zone variations', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_variations',
      description: 'Fetched all red zone variations',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, filter }
    });
    res.status(200).json(results);
  });
});

app.post('/product_category', (req, res) => {
  const { category_name } = req.body;
  if (!category_name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const checkQuery = 'SELECT category_id FROM product_category WHERE category_name = ?';
    logActivity({
    activityType: 'CHECK_UNIQUE',
    tableName: 'product_category',
    description: `Checking uniqueness of category name: ${category_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { category_name }
  });
  connection.query(checkQuery, [category_name], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Database error while checking category name', details: err.message });
    }
    if (results.length > 0) {
      return res.status(400).json({ error: 'Category name must be unique' });
    }

    const category_id = generateId();
    const query = 'INSERT INTO product_category (category_id, category_name) VALUES (?, ?)';
    logActivity({
      activityType: 'CREATE',
      tableName: 'product_category',
      recordId: category_id,
      description: `Creating new product category: ${category_name}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {
        category_id,
        category_name
      }
    });
    connection.query(query, [category_id, category_name], (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'product_category',
          recordId: category_id,
          description: `Failed to create product category: ${category_name}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: {
            error: err.message,
            category_id,
            category_name
          }
        });
        return res.status(500).json({ error: 'Failed to create category', details: err.message });
      }
      res.status(201).json({ message: 'Category created', category_id, category_name });
      logActivity({
        activityType: 'CREATE_SUCCESS',
        tableName: 'product_category',
        recordId: category_id,
        description: `Successfully created product category: ${category_name}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {
          category_id,
          category_name
        }
      });
    });
  });
});

app.get('/product_category', (req, res) => {
  logActivity({
    activityType: 'FETCH_ALL',
    tableName: 'product_category',
    description: 'Fetching all product categories',
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = 'SELECT category_id, category_name, created_at FROM product_category ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_category',
        description: 'Failed to fetch product categories',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch categories', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_category',
      description: 'Successfully fetched all product categories',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/product_category/:category_id', (req, res) => {
  const { category_id } = req.params;
  const query = 'SELECT category_id, category_name, created_at FROM product_category WHERE category_id = ?';
  connection.query(query, [category_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_category',
        recordId: category_id,
        description: `Failed to fetch product category by ID`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch category', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_category',
        recordId: category_id,
        description: `Product category not found`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Category not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'product_category',
      recordId: category_id,
      description: `Fetched product category by ID`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.delete('/product_category/:category_id', (req, res) => {
  const { category_id } = req.params;


  connection.query('SELECT product_id FROM product WHERE category_id = ?', [category_id], (err, products) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_category',
        recordId: category_id,
        description: `Failed to fetch products for category deletion`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch products for category', details: err.message });
    }

    
    const productIds = products.map(p => p.product_id);
    const deleteProductDependencies = (productId, cb) => {
      connection.query('DELETE FROM order_details WHERE product_id = ?', [productId], () => {
        connection.query('DELETE FROM product_order WHERE product_id = ?', [productId], () => {
          connection.query('DELETE FROM stock_modify WHERE product_id = ?', [productId], () => {
           
            connection.query('SELECT variations_id FROM product_variations WHERE product_id = ?', [productId], (err, variations) => {
              if (err) return cb(err);
              const variationIds = variations.map(v => v.variations_id);
              let count = 0;
              if (variationIds.length === 0) return cb();
              variationIds.forEach(vid => {
                connection.query('DELETE FROM variation_attributes WHERE variations_id = ?', [vid], () => {
                  connection.query('DELETE FROM stock_modify WHERE variations_id = ?', [vid], () => {
                    connection.query('DELETE FROM product_order WHERE variations_id = ?', [vid], () => {
                      connection.query('DELETE FROM order_details WHERE variations_id = ?', [vid], () => {
                        connection.query('DELETE FROM product_variations WHERE variations_id = ?', [vid], () => {
                          count++;
                          if (count === variationIds.length) cb();
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    };

  
    let processed = 0;
    if (productIds.length === 0) {
     
      connection.query('DELETE FROM product_category WHERE category_id = ?', [category_id], (err, result) => {
        if (err) {
          logActivity({
            activityType: 'DB_ERROR',
            tableName: 'product_category',
            recordId: category_id,
            description: `Failed to delete product category`,
            performedById: req.session?.userId || 'unknown',
            performedByRole: req.session?.userRole || 'unknown',
            req,
            significance: 'high',
            metadata: { error: err.message }
          });
          return res.status(500).json({ error: 'Failed to delete category', details: err.message });
        }
        if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Category not found' });
        }
        logActivity({
          activityType: 'DELETE_SUCCESS',
          tableName: 'product_category',
          recordId: category_id,
          description: `Deleted product category`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'medium',
          metadata: {}
        });
        res.status(200).json({ message: 'Category deleted', category_id });
      });
      return;
    }

    productIds.forEach(productId => {
      deleteProductDependencies(productId, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete product dependencies', details: err.message });
        }
        connection.query('DELETE FROM product WHERE product_id = ?', [productId], () => {
          processed++;
          if (processed === productIds.length) {
         
            connection.query('DELETE FROM product_category WHERE category_id = ?', [category_id], (err, result) => {
              if (err) {
                logActivity({
                  activityType: 'DB_ERROR',
                  tableName: 'product_category',
                  recordId: category_id,
                  description: `Failed to delete product category`,
                  performedById: req.session?.userId || 'unknown',
                  performedByRole: req.session?.userRole || 'unknown',
                  req,
                  significance: 'high',
                  metadata: { error: err.message }
                });
                return res.status(500).json({ error: 'Failed to delete category', details: err.message });
              }
              if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Category not found' });
              }
              logActivity({
                activityType: 'DELETE_SUCCESS',
                tableName: 'product_category',
                recordId: category_id,
                description: `Deleted product category`,
                performedById: req.session?.userId || 'unknown',
                performedByRole: req.session?.userRole || 'unknown',
                req,
                significance: 'medium',
                metadata: {}
              });
              res.status(200).json({ message: 'Category and all related products deleted', category_id });
            });
          }
        });
      });
    });
  });
});

app.post('/product_unit', (req, res) => {
  const { category_id, category_name, unit_name } = req.body;
  if (!category_id || !category_name || !unit_name) {
    return res.status(400).json({ error: 'category_id, category_name, and unit_name are required' });
  }
  const unit_id = generateId();
  const query = 'INSERT INTO product_unit (unit_id, category_id, category_name, unit_name) VALUES (?, ?, ?, ?)';
  logActivity({
    activityType: 'CREATE',
    tableName: 'product_unit',
    recordId: unit_id,
    description: `Creating new product unit: ${unit_name} in category ${category_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {
      unit_id,
      category_id,
      category_name,
      unit_name
    }
  });
  connection.query(query, [unit_id, category_id, category_name, unit_name], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_unit',
        recordId: unit_id,
        description: `Failed to create product unit: ${unit_name}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: {
          error: err.message,
          unit_id,
          category_id,
          category_name,
          unit_name
        }
      });
      return res.status(500).json({ error: 'Failed to create unit', details: err.message });
    }
    res.status(201).json({ message: 'Unit created', unit_id, category_id, category_name, unit_name });
    logActivity({
      activityType: 'CREATE_SUCCESS',
      tableName: 'product_unit',
      recordId: unit_id,
      description: `Successfully created product unit: ${unit_name}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {
        unit_id,
        category_id,
        category_name,
        unit_name
      }
    });
  });
});

app.get('/product_unit', (req, res) => {
  const query = 'SELECT unit_id, category_id, category_name, unit_name, created_at FROM product_unit ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_unit',
        description: 'Failed to fetch product units',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch units', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_unit',
      description: 'Successfully fetched all product units',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/product_unit/:unit_id', (req, res) => {
  const { unit_id } = req.params;
  const query = 'SELECT unit_id, category_id, category_name, unit_name, created_at FROM product_unit WHERE unit_id = ?';
  connection.query(query, [unit_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_unit',
        recordId: unit_id,
        description: 'Failed to fetch product unit by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch unit', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_unit',
        recordId: unit_id,
        description: 'Product unit not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Unit not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'product_unit',
      recordId: unit_id,
      description: 'Fetched product unit by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.get('/product_unit/category/:category_id', (req, res) => {
  const { category_id } = req.params;
  const query = 'SELECT unit_id, category_id, category_name, unit_name, created_at FROM product_unit WHERE category_id = ? ORDER BY created_at DESC';
  connection.query(query, [category_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_unit',
        description: 'Failed to fetch product units by category_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch units', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_unit',
      description: `Fetched all product units for category_id ${category_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, category_id }
    });
    res.status(200).json(results);
  });
});

app.patch('/product_unit/:unit_id', (req, res) => {
  const { unit_id } = req.params;
  const { unit_name } = req.body;
  if (!unit_name) {
    return res.status(400).json({ error: 'unit_name is required' });
  }
  const query = 'UPDATE product_unit SET unit_name = ? WHERE unit_id = ?';
  connection.query(query, [unit_name, unit_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_unit',
        recordId: unit_id,
        description: 'Failed to update product unit',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update unit', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_unit',
        recordId: unit_id,
        description: 'Product unit not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Unit not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'product_unit',
      recordId: unit_id,
      description: 'Updated product unit',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { unit_name }
    });
    res.status(200).json({ message: 'Unit updated', unit_id, unit_name });
  });
});

app.delete('/product_unit/:unit_id', (req, res) => {
  const { unit_id } = req.params;
  const query = 'DELETE FROM product_unit WHERE unit_id = ?';
  connection.query(query, [unit_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_unit',
        recordId: unit_id,
        description: 'Failed to delete product unit',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete unit', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_unit',
        recordId: unit_id,
        description: 'Product unit not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Unit not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'product_unit',
      recordId: unit_id,
      description: 'Deleted product unit',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Unit deleted', unit_id });
  });
}); 

app.post('/product_taxs', (req, res) => {
  const { category_id, category_name, tax_price } = req.body;
  if (!category_id || !category_name || tax_price === undefined) {
    return res.status(400).json({ error: 'category_id, category_name, and tax_price are required' });
  }
  if (isNaN(tax_price) || tax_price < 0 || tax_price > 100) {
    return res.status(400).json({ error: 'tax_price must be a number between 0 and 100' });
  }
  const tax_id = generateId();
  const query = 'INSERT INTO product_tax (tax_id, category_id, category_name, tax_price) VALUES (?, ?, ?, ?)';
  logActivity({
    activityType: 'CREATE',
    tableName: 'product_tax',
    recordId: tax_id,
    description: `Creating new product tax for category ${category_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { tax_id, category_id, category_name, tax_price }
  });
  connection.query(query, [tax_id, category_id, category_name, tax_price], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_tax',
        recordId: tax_id,
        description: `Failed to create product tax for category ${category_name}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message, tax_id, category_id, category_name, tax_price }
      });
      return res.status(500).json({ error: 'Failed to create tax', details: err.message });
    }
    res.status(201).json({ message: 'Tax created', tax_id, category_id, category_name, tax_price });
    logActivity({
      activityType: 'CREATE_SUCCESS',
      tableName: 'product_tax',
      recordId: tax_id,
      description: `Successfully created product tax for category ${category_name}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { tax_id, category_id, category_name, tax_price }
    });
  });
});

app.get('/product_taxs', (req, res) => {
  const query = 'SELECT tax_id, category_id, category_name, tax_price FROM product_tax ORDER BY category_name ASC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_tax',
        description: 'Failed to fetch product taxes',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch taxes', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_tax',
      description: 'Successfully fetched all product taxes',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/product_taxs/:tax_id', (req, res) => {
  const { tax_id } = req.params;
  const query = 'SELECT tax_id, category_id, category_name, tax_price FROM product_tax WHERE tax_id = ?';
  connection.query(query, [tax_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_tax',
        recordId: tax_id,
        description: 'Failed to fetch product tax by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch tax', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_tax',
        recordId: tax_id,
        description: 'Product tax not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Tax not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'product_tax',
      recordId: tax_id,
      description: 'Fetched product tax by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.get('/product_taxs/category/:category_id', (req, res) => {
  const { category_id } = req.params;
  const query = 'SELECT tax_id, category_id, category_name, tax_price FROM product_tax WHERE category_id = ? ORDER BY category_name ASC';
  connection.query(query, [category_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_tax',
        description: 'Failed to fetch product taxes by category_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch taxes', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_tax',
      description: `Fetched all product taxes for category_id ${category_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, category_id }
    });
    res.status(200).json(results);
  });
});

app.patch('/product_taxs/:tax_id', (req, res) => {
  const { tax_id } = req.params;
  const { tax_price } = req.body;
  if (tax_price === undefined) {
    return res.status(400).json({ error: 'tax_price is required' });
  }
  if (isNaN(tax_price) || tax_price < 0 || tax_price > 100) {
    return res.status(400).json({ error: 'tax_price must be a number between 0 and 100' });
  }
  const query = 'UPDATE product_tax SET tax_price = ? WHERE tax_id = ?';
  connection.query(query, [tax_price, tax_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_tax',
        recordId: tax_id,
        description: 'Failed to update product tax',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update tax', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_tax',
        recordId: tax_id,
        description: 'Product tax not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Tax not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'product_tax',
      recordId: tax_id,
      description: 'Updated product tax',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { tax_price }
    });
    res.status(200).json({ message: 'Tax updated', tax_id, tax_price });
  });
});

app.delete('/product_taxs/:tax_id', (req, res) => {
  const { tax_id } = req.params;
  const query = 'DELETE FROM product_tax WHERE tax_id = ?';
  connection.query(query, [tax_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_tax',
        recordId: tax_id,
        description: 'Failed to delete product tax',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete tax', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_tax',
        recordId: tax_id,
        description: 'Product tax not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Tax not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'product_tax',
      recordId: tax_id,
      description: 'Deleted product tax',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Tax deleted', tax_id });
  });
});

app.post('/product_supplier', (req, res) => {
  const { supplier_name, contact_name, contact_phone_number, email, address } = req.body;
  if (!supplier_name || !contact_name || !contact_phone_number ) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const supplier_id = generateId();
  const query = `INSERT INTO product_supplier 
    (supplier_id, supplier_name, contact_name, contact_phone_number, email, address) 
    VALUES (?, ?, ?, ?, ?, ?)`;
  logActivity({
    activityType: 'CREATE',
    tableName: 'product_supplier',
    recordId: supplier_id,
    description: `Creating new supplier: ${supplier_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { supplier_id, supplier_name, contact_name, contact_phone_number, email, address }
  });
  connection.query(query, [supplier_id, supplier_name, contact_name, contact_phone_number,email || null, address || null], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_supplier',
        recordId: supplier_id,
        description: `Failed to create supplier: ${supplier_name}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to create supplier', details: err.message });
    }
    res.status(201).json({ message: 'Supplier created', supplier_id, supplier_name });
    logActivity({
      activityType: 'CREATE_SUCCESS',
      tableName: 'product_supplier',
      recordId: supplier_id,
      description: `Successfully created supplier: ${supplier_name}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { supplier_id, supplier_name }
    });
  });
});

app.get('/product_supplier', (req, res) => {
  const query = 'SELECT supplier_id, supplier_name, contact_name, contact_phone_number, email, address, created_at FROM product_supplier ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_supplier',
        description: 'Failed to fetch suppliers',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch suppliers', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_supplier',
      description: 'Successfully fetched all suppliers',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/product_supplier/:supplier_id', (req, res) => {
  const { supplier_id } = req.params;
  const query = 'SELECT supplier_id, supplier_name, contact_name, contact_phone_number, email, address, created_at FROM product_supplier WHERE supplier_id = ?';
  connection.query(query, [supplier_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_supplier',
        recordId: supplier_id,
        description: 'Failed to fetch supplier by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch supplier', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_supplier',
        recordId: supplier_id,
        description: 'Supplier not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Supplier not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'product_supplier',
      recordId: supplier_id,
      description: 'Fetched supplier by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.patch('/product_supplier/:supplier_id', (req, res) => {
  const { supplier_id } = req.params;
  const { supplier_name, contact_name, contact_phone_number, email, address } = req.body;
  const updateFields = [];
  const updateValues = [];
  if (supplier_name) {
    updateFields.push('supplier_name = ?');
    updateValues.push(supplier_name);
  }
  if (contact_name) {
    updateFields.push('contact_name = ?');
    updateValues.push(contact_name);
  }
  if (contact_phone_number) {
    updateFields.push('contact_phone_number = ?');
    updateValues.push(contact_phone_number);
  }
  if (email) {
    updateFields.push('email = ?');
    updateValues.push(email);
  }
  if (address) {
    updateFields.push('address = ?');
    updateValues.push(address);
  }
  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }
  const query = `UPDATE product_supplier SET ${updateFields.join(', ')} WHERE supplier_id = ?`;
  updateValues.push(supplier_id);
  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_supplier',
        recordId: supplier_id,
        description: 'Failed to update supplier',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update supplier', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_supplier',
        recordId: supplier_id,
        description: 'Supplier not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Supplier not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'product_supplier',
      recordId: supplier_id,
      description: 'Updated supplier',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { supplier_id }
    });
    res.status(200).json({ message: 'Supplier updated', supplier_id });
  });
});

app.delete('/product_supplier/:supplier_id', (req, res) => {
  const { supplier_id } = req.params;
  const query = 'DELETE FROM product_supplier WHERE supplier_id = ?';
  connection.query(query, [supplier_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_supplier',
        recordId: supplier_id,
        description: 'Failed to delete supplier',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete supplier', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_supplier',
        recordId: supplier_id,
        description: 'Supplier not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Supplier not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'product_supplier',
      recordId: supplier_id,
      description: 'Deleted supplier',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Supplier deleted', supplier_id });
  });
});

function updateSupplierActivity() {
  const updateActive = `
    UPDATE product_supplier ps
    SET supplier_activity = 'active'
    WHERE (
      SELECT COUNT(*) FROM product_order po
      WHERE po.supplier_id = ps.supplier_id
        AND po.order_status = 'recieved'
        AND po.order_date >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
    ) >= 5
  `;
  const updateDormant = `
    UPDATE product_supplier ps
    SET supplier_activity = 'dormant'
    WHERE (
      SELECT COUNT(*) FROM product_order po
      WHERE po.supplier_id = ps.supplier_id
        AND po.order_status = 'recieved'
        AND po.order_date >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
    ) < 5
  `;
  connection.query(updateActive, () => {
    connection.query(updateDormant, () => {
      console.log('Supplier activity status updated');
    });
  });
}

updateSupplierActivity();


cron.schedule('0 1 * * *', updateSupplierActivity);

app.get('/supplier-stats', (req, res) => {
  const totalQuery = 'SELECT COUNT(*) AS total_suppliers FROM product_supplier';
  const activeQuery = "SELECT COUNT(*) AS active_suppliers FROM product_supplier WHERE supplier_activity = 'active'";
  const dormantQuery = "SELECT COUNT(*) AS dormant_suppliers FROM product_supplier WHERE supplier_activity = 'dormant'";

  Promise.all([
    new Promise((resolve, reject) => {
      connection.query(totalQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].total_suppliers);
      });
    }),
    new Promise((resolve, reject) => {
      connection.query(activeQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].active_suppliers);
      });
    }),
    new Promise((resolve, reject) => {
      connection.query(dormantQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].dormant_suppliers);
      });
    })
  ])
  .then(([total_suppliers, active_suppliers, dormant_suppliers]) => {
    res.json({
      total_suppliers,
      active_suppliers,
      dormant_suppliers
    });
  })
  .catch(err => {
    res.status(500).json({ error: 'Failed to fetch supplier stats', details: err.message });
  });
});

//   app.post('/product_variations', upload.single('variation_image'), (req, res) => {
//   const {
//     product_id,
//     product_name,
//     cost_price,
//     selling_price,
//     opening_stock_qty,
//     stock_qty_alert_level,
//     stock_location,
//     stock_expiry_date,
//     current_variations_stock_qty_number,
//     attributes // Should be an array of { attribute_id, value_id }
//   } = req.body;

//   const variations_id = generateVariationId();

//   connection.getConnection((err, conn) => {
//     if (err) return res.status(500).json({ error: 'Failed to get DB connection', details: err.message });

//     conn.beginTransaction(err => {
//       if (err) {
//         conn.release();
//         return res.status(500).json({ error: 'Failed to start transaction', details: err.message });
//       }

//       const safeStockLocation = stock_location ? stock_location : null;
//       const safeStockExpiryDate = stock_expiry_date ? stock_expiry_date : null;

//       logActivity({
//         activityType: 'CREATE',
//         tableName: 'product_variations',
//         recordId: variations_id,
//         description: `Creating new product variation for product_id ${product_id}`,
//         performedById: req.session?.userId || 'unknown',
//         performedByRole: req.session?.userRole || 'unknown',
//         req,
//         significance: 'medium',
//         metadata: {

//           variations_id,
//           product_id,
//           product_name,
//           cost_price,
//           selling_price,
//           opening_stock_qty,
//           stock_qty_alert_level,
//           stock_location: safeStockLocation,
//           stock_expiry_date: safeStockExpiryDate,
//           current_variations_stock_qty_number,
//           attributes: Array.isArray(attributes) ? attributes : []
//         }
//       })
//           const variationQuery = `INSERT INTO product_variations (
//         variations_id, product_id, product_name, cost_price, selling_price, 
//         opening_stock_qty, stock_qty_alert_level, stock_location, 
//         stock_expiry_date, variation_image, current_variations_stock_qty_number
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

//       const variationParams = [
//         variations_id, product_id, product_name, cost_price, selling_price,
//         opening_stock_qty, stock_qty_alert_level, safeStockLocation,
//         safeStockExpiryDate, req.file?.filename || null, current_variations_stock_qty_number
//       ];

//       conn.query(variationQuery, variationParams, (err, result) => {
//         if (err) {
//           return conn.rollback(() => {
//             conn.release();
//             res.status(500).json({ error: 'Failed to create product variation', details: err.message });
//           });
//         }

//         let attrs = [];
//         try {
//           attrs = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
//         } catch {
//           attrs = [];
//         }

//         if (attrs && attrs.length > 0) {
//           let attributesInserted = 0;
//           logActivity({
//             activityType: 'CREATE',
//             tableName: 'variation_attributes',
//             recordId: variations_id,
//             description: `Adding attributes to product variation ${variations_id}`,
//             performedById: req.session?.userId || 'unknown',
//             performedByRole: req.session?.userRole || 'unknown',
//             req,
//             significance: 'medium',
//             metadata: {
//               variations_id,
//               attributes: attrs.map(attr => ({
//                 attribute_id: attr.attribute_id,
//                 value_id: attr.value_id
//               }))
//             }
//           })
//           const attributeInsertQuery = 'INSERT INTO variation_attributes (variation_attribute_id, variations_id, attribute_id, value_id) VALUES (?, ?, ?, ?)';
//           attrs.forEach(attr => {
//             const variation_attribute_id = uuidv4();
//             conn.query(attributeInsertQuery,
//               [variation_attribute_id, variations_id, attr.attribute_id, attr.value_id],
//               (err, result) => {
//                 if (err) {
//                   return conn.rollback(() => {
//                     conn.release();
//                     res.status(500).json({ error: 'Failed to add variation attributes', details: err.message });
//                   });
//                 }
//                 attributesInserted++;
//                 if (attributesInserted === attrs.length) {
//                   conn.commit(err => {
//                     conn.release();
//                     if (err) {
//                       return conn.rollback(() => {
//                         res.status(500).json({ error: 'Failed to commit transaction', details: err.message });
//                       });
//                     }
//                     res.status(201).json({ variations_id, message: 'Product variation created with attributes' });
//                     logActivity({
//                       activityType: 'CREATE_SUCCESS',
//                       tableName: 'product_variations',
//                       recordId: variations_id,
//                       description: `Successfully created product variation for product_id ${product_id} with attributes`,
//                       performedById: req.session?.userId || 'unknown',
//                       performedByRole: req.session?.userRole || 'unknown',
//                       req,
//                       significance: 'medium',
//                       metadata: {
//                         variations_id,
//                         product_id,
//                         product_name,
//                         cost_price,
//                         selling_price,
//                         opening_stock_qty,
//                         stock_qty_alert_level,
//                         stock_location,
//                         stock_expiry_date,
//                         current_variations_stock_qty_number,
//                         attributes: attrs.map(attr => ({
//                           attribute_id: attr.attribute_id,
//                           value_id: attr.value_id
//                         }))
//                       }
//                     })
//                   });
//                 }
//               });
//           });
//         } else {
//           conn.commit(err => {
//             conn.release();
//             if (err) {
//               return conn.rollback(() => {
//                 res.status(500).json({ error: 'Failed to commit transaction', details: err.message });
//                 logActivity({
//                   activityType: 'COMMIT_ERROR',

//                   tableName: 'product_variations',
//                   recordId: variations_id,
//                   description: `Failed to commit transaction for product variation ${variations_id}`,
//                   performedById: req.session?.userId || 'unknown',
//                   performedByRole: req.session?.userRole || 'unknown',
//                   req,
//                   significance: 'high',
//                   metadata: {

//                     variations_id,
//                     product_id,
//                     product_name,
//                     cost_price,
//                     selling_price,
//                     opening_stock_qty,
//                     stock_qty_alert_level,
//                     stock_location,
//                     stock_expiry_date,
//                     current_variations_stock_qty_number,
//                     attributes: Array.isArray(attributes) ? attributes : []
//                   }

//                 })
//               });
//             }
//             res.status(201).json({ variations_id, message: 'Product variation created without attributes' });
//             logActivity({
//               activityType: 'CREATE_SUCCESS',
//               tableName: 'product_variations',
//               recordId: variations_id,
//               description: `Successfully created product variation for product_id ${product_id}`,
//               performedById: req.session?.userId || 'unknown',
//               performedByRole: req.session?.userRole || 'unknown',
//               req,
//               significance: 'medium',
//               metadata: {
//                 variations_id,
//                 product_id,
//                 product_name,
//                 cost_price,
//                 selling_price,
//                 opening_stock_qty,
//                 stock_qty_alert_level,
//                 stock_location,
//                 stock_expiry_date,
//                 current_variations_stock_qty_number,
//                 attributes: Array.isArray(attributes) ? attributes : []
//               }
//             })
//           });
//         }
//       });
//     });
//   });
// });

app.post('/product_variations', upload.single('variation_image'), (req, res) => {
  const {
    product_id,
    product_name,
    cost_price,
    selling_price,
    opening_stock_qty,
    stock_qty_alert_level,
    stock_location,
    stock_expiry_date,
    current_variations_stock_qty_number,
    attributes 
  } = req.body;

  const variations_id = generateVariationId();

  connection.getConnection((err, conn) => {
    if (err) return res.status(500).json({ error: 'Failed to get DB connection', details: err.message });

    conn.beginTransaction(err => {
      if (err) {
        conn.release();
        return res.status(500).json({ error: 'Failed to start transaction', details: err.message });
      }

      const safeStockLocation = stock_location ? stock_location : null;
      const safeStockExpiryDate = stock_expiry_date ? stock_expiry_date : null;

      logActivity({
        activityType: 'CREATE',
        tableName: 'product_variations',
        recordId: variations_id,
        description: `Creating new product variation for product_id ${product_id}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {
          variations_id,
          product_id,
          product_name,
          cost_price,
          selling_price,
          opening_stock_qty,
          stock_qty_alert_level,
          stock_location: safeStockLocation,
          stock_expiry_date: safeStockExpiryDate,
          current_variations_stock_qty_number,
          attributes: Array.isArray(attributes) ? attributes : []
        }
      });

      const variationQuery = `INSERT INTO product_variations (
        variations_id, product_id, product_name, cost_price, selling_price, 
        opening_stock_qty, stock_qty_alert_level, stock_location, 
        stock_expiry_date, variation_image, current_variations_stock_qty_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const variationParams = [
        variations_id, product_id, product_name, cost_price, selling_price,
        opening_stock_qty, stock_qty_alert_level, safeStockLocation,
        safeStockExpiryDate, req.file?.filename || null, current_variations_stock_qty_number
      ];

      conn.query(variationQuery, variationParams, (err, result) => {
        if (err) {
          return conn.rollback(() => {
            conn.release();
            res.status(500).json({ error: 'Failed to create product variation', details: err.message });
          });
        }

        
        if (opening_stock_qty !== undefined && Number(opening_stock_qty) > 0) {
          const stock_modify_id = generateId();
          const adjustment_type = 'opening stock';
          const adjustment_action = 'increase';
          const adjustment_reason = `variation created with opening stock of ${opening_stock_qty}`;
          const notes = adjustment_reason;
          const performed_by = req.session?.admin
            ? `${req.session.admin.first_name} ${req.session.admin.last_name}`
            : 'System';

          const stockModifyQuery = `INSERT INTO stock_modify (
            stock_modify_id, adjustment_type, product_name, product_id, variations_id, size,
            adjustment_action, adjustment_reason, notes, date, performed_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

          conn.query(
            stockModifyQuery,
            [
              stock_modify_id,
              adjustment_type,
              product_name,
              product_id,
              variations_id,
              opening_stock_qty,
              adjustment_action,
              adjustment_reason,
              notes,
              new Date(),
              performed_by
            ],
            (stockErr) => {
              if (stockErr) {
                return conn.rollback(() => {
                  conn.release();
                  res.status(500).json({ error: 'Failed to record opening stock in stock_modify', details: stockErr.message });
                });
              }
             
              insertAttributes();
            }
          );
        } else {
         
          insertAttributes();
        }

        function insertAttributes() {
          let attrs = [];
          try {
            attrs = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
          } catch {
            attrs = [];
          }

          if (attrs && attrs.length > 0) {
            let attributesInserted = 0;
            logActivity({
              activityType: 'CREATE',
              tableName: 'variation_attributes',
              recordId: variations_id,
              description: `Adding attributes to product variation ${variations_id}`,
              performedById: req.session?.userId || 'unknown',
              performedByRole: req.session?.userRole || 'unknown',
              req,
              significance: 'medium',
              metadata: {
                variations_id,
                attributes: attrs.map(attr => ({
                  attribute_id: attr.attribute_id,
                  value_id: attr.value_id
                }))
              }
            });
            const attributeInsertQuery = 'INSERT INTO variation_attributes (variation_attribute_id, variations_id, attribute_id, value_id) VALUES (?, ?, ?, ?)';
            attrs.forEach(attr => {
              const variation_attribute_id = uuidv4();
              conn.query(attributeInsertQuery,
                [variation_attribute_id, variations_id, attr.attribute_id, attr.value_id],
                (err, result) => {
                  if (err) {
                    return conn.rollback(() => {
                      conn.release();
                      res.status(500).json({ error: 'Failed to add variation attributes', details: err.message });
                    });
                  }
                  attributesInserted++;
                  if (attributesInserted === attrs.length) {
                    conn.commit(err => {
                      conn.release();
                      if (err) {
                        return conn.rollback(() => {
                          res.status(500).json({ error: 'Failed to commit transaction', details: err.message });
                        });
                      }
                      res.status(201).json({ variations_id, message: 'Product variation created with attributes' });
                      logActivity({
                        activityType: 'CREATE_SUCCESS',
                        tableName: 'product_variations',
                        recordId: variations_id,
                        description: `Successfully created product variation for product_id ${product_id} with attributes`,
                        performedById: req.session?.userId || 'unknown',
                        performedByRole: req.session?.userRole || 'unknown',
                        req,
                        significance: 'medium',
                        metadata: {
                          variations_id,
                          product_id,
                          product_name,
                          cost_price,
                          selling_price,
                          opening_stock_qty,
                          stock_qty_alert_level,
                          stock_location,
                          stock_expiry_date,
                          current_variations_stock_qty_number,
                          attributes: attrs.map(attr => ({
                            attribute_id: attr.attribute_id,
                            value_id: attr.value_id
                          }))
                        }
                      });
                    });
                  }
                });
            });
          } else {
            conn.commit(err => {
              conn.release();
              if (err) {
                return conn.rollback(() => {
                  res.status(500).json({ error: 'Failed to commit transaction', details: err.message });
                  logActivity({
                    activityType: 'COMMIT_ERROR',
                    tableName: 'product_variations',
                    recordId: variations_id,
                    description: `Failed to commit transaction for product variation ${variations_id}`,
                    performedById: req.session?.userId || 'unknown',
                    performedByRole: req.session?.userRole || 'unknown',
                    req,
                    significance: 'high',
                    metadata: {
                      variations_id,
                      product_id,
                      product_name,
                      cost_price,
                      selling_price,
                      opening_stock_qty,
                      stock_qty_alert_level,
                      stock_location,
                      stock_expiry_date,
                      current_variations_stock_qty_number,
                      attributes: Array.isArray(attributes) ? attributes : []
                    }
                  });
                });
              }
              res.status(201).json({ variations_id, message: 'Product variation created without attributes' });
              logActivity({
                activityType: 'CREATE_SUCCESS',
                tableName: 'product_variations',
                recordId: variations_id,
                description: `Successfully created product variation for product_id ${product_id}`,
                performedById: req.session?.userId || 'unknown',
                performedByRole: req.session?.userRole || 'unknown',
                req,
                significance: 'medium',
                metadata: {
                  variations_id,
                  product_id,
                  product_name,
                  cost_price,
                  selling_price,
                  opening_stock_qty,
                  stock_qty_alert_level,
                  stock_location,
                  stock_expiry_date,
                  current_variations_stock_qty_number,
                  attributes: Array.isArray(attributes) ? attributes : []
                }
              });
            });
          }
        }
      });
    });
  });
});

app.get('/product_variations_with_attributes', (req, res) => {
  const variationsQuery = `
    SELECT 
      pv.*,
      p.category_id,
      p.category_name,
      p.brand,
      p.unit_name
    FROM product_variations pv
    JOIN product p ON pv.product_id = p.product_id
    ORDER BY pv.created_at DESC
  `;
  connection.query(variationsQuery, (err, variations) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch product variations', details: err.message });
    }
    if (!variations.length) return res.status(200).json([]);

    const variationsIds = variations.map(v => v.variations_id);
    const attributesQuery = `
      SELECT 
        va.variations_id,
        a.attribute_id,
        a.attribute_name,
        av.value_id,
        av.value
      FROM variation_attributes va
      JOIN attribute a ON va.attribute_id = a.attribute_id
      JOIN attribute_values av ON va.value_id = av.value_id
      WHERE va.variations_id IN (?)
      ORDER BY va.variations_id, a.attribute_name, av.display_order, av.value
    `;

    connection.query(attributesQuery, [variationsIds], (attrErr, attributes) => {
      if (attrErr) {
        return res.status(500).json({ error: 'Failed to fetch attributes', details: attrErr.message });
      }
      const attrMap = {};
      attributes.forEach(attr => {
        if (!attrMap[attr.variations_id]) attrMap[attr.variations_id] = [];
        attrMap[attr.variations_id].push({
          attribute_id: attr.attribute_id,
          attribute_name: attr.attribute_name,
          value_id: attr.value_id,
          value: attr.value
        });
      });
      const result = variations.map(v => ({
        ...v,
        attributes: attrMap[v.variations_id] || []
      }));
      res.status(200).json(result);
    });
  });
});


app.get('/product_variations/:variations_id/with_attributes', (req, res) => {
  const { variations_id } = req.params;
  

  const variationQuery = 'SELECT * FROM product_variations WHERE variations_id = ?';
  
  connection.query(variationQuery, [variations_id], (err, variationResults) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch product variation', details: err.message });
    }
    
    if (variationResults.length === 0) {
      return res.status(404).json({ error: 'Product variation not found' });
    }
    
  const attributesQuery = `
      SELECT a.attribute_id, a.attribute_name, av.value_id, av.value 
      FROM variation_attributes va
      JOIN attribute a ON va.attribute_id = a.attribute_id
      JOIN attribute_values av ON va.value_id = av.value_id
      WHERE va.variations_id = ?
    `;
    
    connection.query(attributesQuery, [variations_id], (err, attributesResults) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch variation attributes', details: err.message });
      }
      
     
   const response = {
        ...variationResults[0],
        attributes: attributesResults || []
      };
      
      res.status(200).json(response);
    });
  });
});

app.get('/product_variations', (req, res) => {
  const query = 'SELECT * FROM product_variations ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_variations',
        description: 'Failed to fetch product variations',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch product variations', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_variations',
      description: 'Successfully fetched all product variations',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/product_variations/:variations_id', (req, res) => {
  const { variations_id } = req.params;
  const query = 'SELECT * FROM product_variations WHERE variations_id = ?';
  connection.query(query, [variations_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_variations',
        recordId: variations_id,
        description: 'Failed to fetch product variation by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch product variation', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_variations',
        recordId: variations_id,
        description: 'Product variation not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Product variation not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'product_variations',
      recordId: variations_id,
      description: 'Fetched product variation by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.get('/product_variations/product/:product_id', (req, res) => {
  const { product_id } = req.params;
  const query = 'SELECT * FROM product_variations WHERE product_id = ? ORDER BY created_at DESC';
  connection.query(query, [product_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_variations',
        description: 'Failed to fetch product variations by product_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch product variations', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_variations',
      description: `Fetched all product variations for product_id ${product_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, product_id }
    });
    res.status(200).json(results);
  });
});

app.patch('/product_variations/:variations_id', upload.single('variation_image'), (req, res) => {
  const { variations_id } = req.params;
  const {
    product_id,
    product_name,
    cost_price,
    selling_price,
    opening_stock_qty,
    stock_qty_alert_level,
    stock_location,
    stock_expiry_date,
    current_variations_stock_qty_number,
    attributes
  } = req.body;

  connection.getConnection((err, conn) => {
    if (err) return res.status(500).json({ error: 'Failed to get DB connection', details: err.message });

    conn.beginTransaction(err => {
      if (err) {
        conn.release();
        return res.status(500).json({ error: 'Failed to start transaction', details: err.message });
      }

      const updateFields = [];
      const updateValues = [];

      if (product_id) { updateFields.push('product_id = ?'); updateValues.push(product_id); }
      if (product_name) { updateFields.push('product_name = ?'); updateValues.push(product_name); }
      if (cost_price !== undefined) { updateFields.push('cost_price = ?'); updateValues.push(cost_price); }
      if (selling_price !== undefined) { updateFields.push('selling_price = ?'); updateValues.push(selling_price); }
      if (opening_stock_qty !== undefined) { updateFields.push('opening_stock_qty = ?'); updateValues.push(opening_stock_qty); }
      if (stock_qty_alert_level !== undefined) { updateFields.push('stock_qty_alert_level = ?'); updateValues.push(stock_qty_alert_level); }
      if (stock_location) { updateFields.push('stock_location = ?'); updateValues.push(stock_location); }
      if (stock_expiry_date) { updateFields.push('stock_expiry_date = ?'); updateValues.push(stock_expiry_date); }
      if (current_variations_stock_qty_number !== undefined) {
        updateFields.push('current_variations_stock_qty_number = ?');
        updateValues.push(current_variations_stock_qty_number);
      }
      if (req.file) {
        updateFields.push('variation_image = ?');
        updateValues.push(req.file.filename);
      }

      let attrs = [];
      try {
        attrs = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
      } catch {
        attrs = [];
      }

      if (updateFields.length === 0 && !attrs) {
        conn.release();
        return res.status(400).json({ error: 'At least one field must be provided for update' });
      }

      function handleAttributesUpdate() {
        if (!attrs) {
          return conn.commit(err => {
            conn.release();
            if (err) {
              return conn.rollback(() => {
                res.status(500).json({ error: 'Failed to commit transaction', details: err.message });
              });
            }
            res.status(200).json({ message: 'Product variation updated', variations_id });
          });
        }

        const deleteQuery = 'DELETE FROM variation_attributes WHERE variations_id = ?';
        conn.query(deleteQuery, [variations_id], (err, result) => {
          if (err) {
            return conn.rollback(() => {
              conn.release();
              res.status(500).json({ error: 'Failed to update variation attributes', details: err.message });
            });
          }

          if (!attrs.length) {
            return conn.commit(err => {
              conn.release();
              if (err) {
                return conn.rollback(() => {
                  res.status(500).json({ error: 'Failed to commit transaction', details: err.message });
                });
              }
              res.status(200).json({ message: 'Product variation updated and all attributes removed', variations_id });
            });
          }

          let attributesInserted = 0;
          const attributeInsertQuery = 'INSERT INTO variation_attributes (variation_attribute_id, variations_id, attribute_id, value_id) VALUES (?, ?, ?, ?)';
          attrs.forEach(attr => {
            const variation_attribute_id = uuidv4();
            conn.query(attributeInsertQuery,
              [variation_attribute_id, variations_id, attr.attribute_id, attr.value_id],
              (err, result) => {
                if (err) {
                  return conn.rollback(() => {
                    conn.release();
                    res.status(500).json({ error: 'Failed to update variation attributes', details: err.message });
                  });
                }
                attributesInserted++;
                if (attributesInserted === attrs.length) {
                  conn.commit(err => {
                    conn.release();
                    if (err) {
                      return conn.rollback(() => {
                        res.status(500).json({ error: 'Failed to commit transaction', details: err.message });
                      });
                    }
                    res.status(200).json({
                      message: 'Product variation and attributes updated',
                      variations_id
                    });
                  });
                }
              });
          });
        });
      }

      if (updateFields.length > 0) {
        const query = `UPDATE product_variations SET ${updateFields.join(', ')} WHERE variations_id = ?`;
        updateValues.push(variations_id);

        conn.query(query, updateValues, (err, result) => {
          if (err) {
            return conn.rollback(() => {
              conn.release();
              res.status(500).json({ error: 'Failed to update product variation', details: err.message });
            });
          }
          if (result.affectedRows === 0) {
            return conn.rollback(() => {
              conn.release();
              res.status(404).json({ error: 'Product variation not found' });
            });
          }
          handleAttributesUpdate();
        });
      } else {
        handleAttributesUpdate();
      }
    });
  });
});

app.delete('/product_variations/:variations_id', (req, res) => {
  const { variations_id } = req.params;

  
  connection.query('DELETE FROM variation_attributes WHERE variations_id = ?', [variations_id], (err) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'variation_attributes',
        recordId: variations_id,
        description: 'Failed to delete variation_attributes referencing product variation',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete related variation attributes', details: err.message });
    }

    connection.query('DELETE FROM stock_modify WHERE variations_id = ?', [variations_id], (err) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'stock_modify',
          recordId: variations_id,
          description: 'Failed to delete stock_modify referencing product variation',
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to delete related stock modifications', details: err.message });
      }

      connection.query('DELETE FROM product_order WHERE variations_id = ?', [variations_id], (err) => {
        if (err) {
          logActivity({
            activityType: 'DB_ERROR',
            tableName: 'product_order',
            recordId: variations_id,
            description: 'Failed to delete product_order referencing product variation',
            performedById: req.session?.userId || 'unknown',
            performedByRole: req.session?.userRole || 'unknown',
            req,
            significance: 'high',
            metadata: { error: err.message }
          });
          return res.status(500).json({ error: 'Failed to delete related product orders', details: err.message });
        }

        connection.query('DELETE FROM order_details WHERE variations_id = ?', [variations_id], (err) => {
          if (err) {
            logActivity({
              activityType: 'DB_ERROR',
              tableName: 'order_details',
              recordId: variations_id,
              description: 'Failed to delete order_details referencing product variation',
              performedById: req.session?.userId || 'unknown',
              performedByRole: req.session?.userRole || 'unknown',
              req,
              significance: 'high',
              metadata: { error: err.message }
            });
            return res.status(500).json({ error: 'Failed to delete related order details', details: err.message });
          }

          
          connection.query('DELETE FROM product_variations WHERE variations_id = ?', [variations_id], (err, result) => {
            if (err) {
              logActivity({
                activityType: 'DB_ERROR',
                tableName: 'product_variations',
                recordId: variations_id,
                description: 'Failed to delete product variation',
                performedById: req.session?.userId || 'unknown',
                performedByRole: req.session?.userRole || 'unknown',
                req,
                significance: 'high',
                metadata: { error: err.message }
              });
              return res.status(500).json({ error: 'Failed to delete product variation', details: err.message });
            }
            if (result.affectedRows === 0) {
              logActivity({
                activityType: 'NOT_FOUND',
                tableName: 'product_variations',
                recordId: variations_id,
                description: 'Product variation not found for deletion',
                performedById: req.session?.userId || 'unknown',
                performedByRole: req.session?.userRole || 'unknown',
                req,
                significance: 'medium',
                metadata: {}
              });
              return res.status(404).json({ error: 'Product variation not found' });
            }
            logActivity({
              activityType: 'DELETE_SUCCESS',
              tableName: 'product_variations',
              recordId: variations_id,
              description: 'Deleted product variation',
              performedById: req.session?.userId || 'unknown',
              performedByRole: req.session?.userRole || 'unknown',
              req,
              significance: 'medium',
              metadata: {}
            });
            res.status(200).json({ message: 'Product variation deleted', variations_id });
          });
        });
      });
    });
  });
});
app.post('/attributes', (req, res) => {
  const { attribute_name } = req.body;
  if (!attribute_name) {
    return res.status(400).json({ error: 'Attribute name is required' });
  }

  const checkQuery = 'SELECT attribute_id FROM attribute WHERE LOWER(attribute_name) = LOWER(?)';
  connection.query(checkQuery, [attribute_name], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'attributes',
        description: 'Failed to check for duplicate attribute',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to check attribute', details: err.message });
    }
    if (results.length > 0) {
      return res.status(400).json({ error: 'Attribute name must be unique' });
    }

    const attribute_id = uuidv4();
    const query = 'INSERT INTO attribute (attribute_id, attribute_name) VALUES (?, ?)';
    connection.query(query, [attribute_id, attribute_name], (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'attributes',
          description: 'Failed to create attribute',
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create attribute', details: err.message });
      }
      res.status(201).json({ attribute_id, message: 'Attribute created successfully' });
    });
  });
});

app.get('/attributes', (req, res) => {
  const query = 'SELECT * FROM attribute ORDER BY attribute_name';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'attributes',
        description: 'Failed to fetch attributes',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch attributes', details: err.message });
    }
    res.status(200).json(results);
  });
});

app.get('/attributes/:attribute_id', (req, res) => {
  const { attribute_id } = req.params;
  const query = 'SELECT * FROM attribute WHERE attribute_id = ?';
  connection.query(query, [attribute_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'attributes',
        recordId: attribute_id,
        description: 'Failed to fetch attribute by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch attribute', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'attributes',
        recordId: attribute_id,
        description: 'Attribute not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Attribute not found' });
    }
    res.status(200).json(results[0]);
  });
});

app.patch('/attributes/:attribute_id', (req, res) => {
  const { attribute_id } = req.params;
  const { attribute_name } = req.body;
  if (!attribute_name) {
    return res.status(400).json({ error: 'Attribute name is required' });
  }

  const checkQuery = 'SELECT attribute_id FROM attribute WHERE LOWER(attribute_name) = LOWER(?) AND attribute_id != ?';
  connection.query(checkQuery, [attribute_name, attribute_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'attributes',
        description: 'Failed to check for duplicate attribute',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to check attribute', details: err.message });
    }
    if (results.length > 0) {
      return res.status(400).json({ error: 'Attribute name must be unique' });
    }

    const updateQuery = 'UPDATE attribute SET attribute_name = ? WHERE attribute_id = ?';
    connection.query(updateQuery, [attribute_name, attribute_id], (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'attributes',
          description: 'Failed to update attribute',
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to update attribute', details: err.message });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Attribute not found' });
      }
      res.status(200).json({ attribute_id, message: 'Attribute updated successfully' });
    });
  });
});


app.delete('/attributes/:attribute_id', (req, res) => {
  const { attribute_id } = req.params;
  
  connection.query('DELETE FROM variation_attributes WHERE attribute_id = ?', [attribute_id], (err) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'variation_attributes',
        recordId: attribute_id,
        description: 'Failed to delete variation_attributes referencing attribute',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete related variation attributes', details: err.message });
    }
    
    connection.query('DELETE FROM attribute_values WHERE attribute_id = ?', [attribute_id], (err) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'attribute_values',
          recordId: attribute_id,
          description: 'Failed to delete attribute_values referencing attribute',
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to delete related attribute values', details: err.message });
      }
     
      connection.query('DELETE FROM attribute WHERE attribute_id = ?', [attribute_id], (err, result) => {
        if (err) {
          logActivity({
            activityType: 'DB_ERROR',
            tableName: 'attributes',
            recordId: attribute_id,
            description: 'Failed to delete attribute',
            performedById: req.session?.userId || 'unknown',
            performedByRole: req.session?.userRole || 'unknown',
            req,
            significance: 'high',
            metadata: { error: err.message }
          });
          return res.status(500).json({ error: 'Failed to delete attribute', details: err.message });
        }
        if (result.affectedRows === 0) {
          logActivity({
            activityType: 'NOT_FOUND',
            tableName: 'attributes',
            recordId: attribute_id,
            description: 'Attribute not found for deletion',
            performedById: req.session?.userId || 'unknown',
            performedByRole: req.session?.userRole || 'unknown',
            req,
            significance: 'medium',
            metadata: {}
          });
          return res.status(404).json({ error: 'Attribute not found' });
        }
        logActivity({
          activityType: 'DELETE_SUCCESS',
          tableName: 'attributes',
          recordId: attribute_id,
          description: 'Deleted attribute',
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'medium',
          metadata: {}
        });
        res.status(200).json({ message: 'Attribute deleted', attribute_id });
      });
    });
  });
});


app.post('/attributes/:attribute_id/values', (req, res) => {
  const { attribute_id } = req.params;
  const { value, display_order } = req.body;
  const value_id = uuidv4();

  
  const checkQuery = 'SELECT value_id FROM attribute_values WHERE attribute_id = ? AND LOWER(value) = LOWER(?)';
  connection.query(checkQuery, [attribute_id, value], (checkErr, checkResults) => {
    if (checkErr) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'attribute_values',
        description: 'Failed to check for duplicate attribute value',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: checkErr.message }
      });
      return res.status(500).json({ error: 'Failed to check for duplicate value', details: checkErr.message });
    }
    if (checkResults.length > 0) {
      return res.status(400).json({ error: 'This value already exists for this attribute.' });
    }

   
    const query = 'INSERT INTO attribute_values (value_id, attribute_id, value, display_order) VALUES (?, ?, ?, ?)';
    connection.query(query, [value_id, attribute_id, value, display_order || 0], (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'attribute_values',
          description: 'Failed to add attribute value',
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to add attribute value', details: err.message });
      }
      res.status(201).json({ value_id, message: 'Attribute value added successfully' });
    });
  });
});


app.get('/attributes/:attribute_id/values', (req, res) => {
  const { attribute_id } = req.params;
  const query = 'SELECT * FROM attribute_values WHERE attribute_id = ? ORDER BY display_order, value';
  connection.query(query, [attribute_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'attribute_values',
        description: 'Failed to fetch attribute values',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch attribute values', details: err.message });
    }
    res.status(200).json(results);
  });
});

app.get('/attributes/values/:value_id', (req, res) => {
  const { value_id } = req.params;
  const query = 'SELECT * FROM attribute_values WHERE value_id = ?';
  connection.query(query, [value_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'attribute_values',
        recordId: value_id,
        description: 'Failed to fetch attribute value by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch attribute value', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'attribute_values',
        recordId: value_id,
        description: 'Attribute value not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Attribute value not found' });
    }
    res.status(200).json(results[0]);
  });
});

app.patch('/attributes/values/:value_id', (req, res) => {
  const { value_id } = req.params;
  let { value, display_order } = req.body;

  
  const updateFields = [];
  const updateValues = [];

  if (typeof value !== 'undefined') {
    updateFields.push('value = ?');
    updateValues.push(value);
  }
  if (typeof display_order !== 'undefined') {
    updateFields.push('display_order = ?');
    updateValues.push(display_order);
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const updateQuery = `UPDATE attribute_values SET ${updateFields.join(', ')} WHERE value_id = ?`;
  updateValues.push(value_id);

  connection.query(updateQuery, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'attribute_values',
        description: 'Failed to update attribute value',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update attribute value', details: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attribute value not found' });
    }
    res.status(200).json({ value_id, message: 'Attribute value updated successfully' });
  });
});

app.delete('/attributes/values/:value_id', (req, res) => {
  const { value_id } = req.params;
  
  connection.query('DELETE FROM variation_attributes WHERE value_id = ?', [value_id], (err) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'variation_attributes',
        recordId: value_id,
        description: 'Failed to delete variation_attributes referencing attribute value',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete related variation attributes', details: err.message });
    }
   
    connection.query('DELETE FROM attribute_values WHERE value_id = ?', [value_id], (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'attribute_values',
          recordId: value_id,
          description: 'Failed to delete attribute value',
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to delete attribute value', details: err.message });
      }
      if (result.affectedRows === 0) {
        logActivity({
          activityType: 'NOT_FOUND',
          tableName: 'attribute_values',
          recordId: value_id,
          description: 'Attribute value not found for deletion',
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'medium',
          metadata: {}
        });
        return res.status(404).json({ error: 'Attribute value not found' });
      }
      logActivity({
        activityType: 'DELETE_SUCCESS',
        tableName: 'attribute_values',
        recordId: value_id,
        description: 'Deleted attribute value',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      res.status(200).json({ message: 'Attribute value deleted', value_id });
    });
  });
});

app.get('/variation_attributes/:variations_id', (req, res) => {
  const { variations_id } = req.params;

  // Join to get attribute name and value for each attribute linked to this variation
  const query = `
    SELECT 
      va.variation_attribute_id,
      va.variations_id,
      va.attribute_id,
      a.attribute_name,
      va.value_id,
      av.value AS attribute_value
    FROM variation_attributes va
    JOIN attribute a ON va.attribute_id = a.attribute_id
    JOIN attribute_values av ON va.value_id = av.value_id
    WHERE va.variations_id = ?
    ORDER BY a.attribute_name, av.display_order, av.value
  `;
  logActivity({
    activityType: 'FETCH',
    tableName: 'variation_attributes',
    recordId: variations_id,
    description: `Fetching attributes for variation ID: ${variations_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { variations_id }

  })

  connection.query(query, [variations_id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch variation attributes', details: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'No attributes found for this variation' });
    }
    logActivity({
      activityType: 'FETCH_SUCCESS',
      tableName: 'variation_attributes',
      recordId: variations_id,
      description: `Successfully fetched attributes for variation ID: ${variations_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { variations_id, count: results.length }
    })
    res.status(200).json(results);
    logActivity({
      activityType: 'FETCH_SUCCESS',
      tableName: 'variation_attributes',
      recordId: variations_id,
      description: `Fetched attributes for variation ID: ${variations_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { variations_id, count: results.length }

      })
  });
});

app.get('/variation_attributes/product/:product_id', (req, res) => {
  const { product_id } = req.params;

  // Join to get all attributes and values for all variations of this product
  const query = `
    SELECT 
      va.variation_attribute_id,
      va.variations_id,
      pv.product_id,
      pv.product_name,
      va.attribute_id,
      a.attribute_name,
      va.value_id,
      av.value AS attribute_value
    FROM product_variations pv
    JOIN variation_attributes va ON pv.variations_id = va.variations_id
    JOIN attribute a ON va.attribute_id = a.attribute_id
    JOIN attribute_values av ON va.value_id = av.value_id
    WHERE pv.product_id = ?
    ORDER BY va.variations_id, a.attribute_name, av.display_order, av.value
  `;

  logActivity({
    activityType: 'FETCH',
    tableName: 'variation_attributes',
    recordId: product_id,
    description: `Fetching all variation attributes for product ID: ${product_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { product_id }
  });

  connection.query(query, [product_id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch variation attributes for product', details: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'No variation attributes found for this product' });
    }
    logActivity({
      activityType: 'FETCH_SUCCESS',
      tableName: 'variation_attributes',
      recordId: product_id,
      description: `Successfully fetched all variation attributes for product ID: ${product_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { product_id, count: results.length }
    });
    res.status(200).json(results);
  });
});



app.post('/product_order', (req, res) => {
  const {
    supplier_id,
    supplier_name,
    order_date,
    expected_delivery_date,
    created_by,
    items
  } = req.body;

  if (
    !supplier_id ||
    !supplier_name ||
    !order_date ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }

  const order_id = generateId();
const query = `INSERT INTO product_order (
    order_id, supplier_id, supplier_name, order_date, expected_delivery_date, product_id, product_name, cost_price, variations_id, order_quantity, order_status, order_amount, created_by, has_payment_confirmed
  ) VALUES ?`;

  const values = items.map(item => [
    order_id,
    supplier_id,
    supplier_name,
    order_date,
    expected_delivery_date || null,
    item.product_id,
    item.product_name,
     item.unit_price || 0,
    item.variations_id || null,
    item.order_quantity,
    'pending',
    item.order_amount,
    created_by || null,
    'awaiting'
  ]);

    const firstProductName = items[0]?.product_name || '';
  const productNames = items.map(i => i.product_name).join(', ');
  const productIds = items.map(i => i.product_id).join(', ');


 logActivity({
    activityType: 'CREATE',
    tableName: 'product_order',
    recordId: order_id,
    description: `Creating new product order for products: ${productNames}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {
      order_id,
      supplier_id,
      supplier_name,
      order_date,
      expected_delivery_date,
      items,
      order_status: 'pending',
      created_by
    }
  });

    connection.query(query, [values], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_order',
        recordId: order_id,
        description: `Failed to create product order for products: ${productNames}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to create product order', details: err.message });
    }
    res.status(201).json({ message: 'Product order created', order_id, products: productNames });
    logActivity({
      activityType: 'CREATE_SUCCESS',
      tableName: 'product_order',
      recordId: order_id,
      description: `Successfully created product order for products: ${productNames}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { order_id, products: productNames }
    });
  });
});
app.get('/product_order', (req, res) => {
  const query = 'SELECT * FROM product_order ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_order',
        description: 'Failed to fetch product orders',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch product orders', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_order',
      description: 'Successfully fetched all product orders',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/product_order/:order_id', (req, res) => {
  const { order_id } = req.params;
  const query = 'SELECT * FROM product_order WHERE order_id = ?';
  connection.query(query, [order_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_order',
        recordId: order_id,
        description: 'Failed to fetch product order by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch product order', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_order',
        recordId: order_id,
        description: 'Product order not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Product order not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'product_order',
      recordId: order_id,
      description: 'Fetched product order by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
 res.status(200).json(results);
  });
});

app.get('/product_order/supplier/:supplier_id', (req, res) => {
  const { supplier_id } = req.params;
  const query = 'SELECT * FROM product_order WHERE supplier_id = ? ORDER BY created_at DESC';
  connection.query(query, [supplier_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_order',
        description: 'Failed to fetch product orders by supplier_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch product orders', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_order',
      description: `Fetched all product orders for supplier_id ${supplier_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, supplier_id }
    });
    res.status(200).json(results);
  });
});

app.get('/product_order/product/:product_id', (req, res) => {
  const { product_id } = req.params;
  const query = 'SELECT * FROM product_order WHERE product_id = ? ORDER BY created_at DESC';
  connection.query(query, [product_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_order',
        description: 'Failed to fetch product orders by product_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch product orders', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_order',
      description: `Fetched all product orders for product_id ${product_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, product_id }
    });
    res.status(200).json(results);
  });
});

app.get('/product_order/variations/:variations_id', (req, res) => {
     const { variations_id} = req.params;
  const query = 'SELECT * FROM product_order WHERE variations_id = ? ORDER BY created_at DESC';
  connection.query(query, [product_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_order',
        description: 'Failed to fetch product orders by variations_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch product orders', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'product_order',
      description: `Fetched all product orders for variations_id ${variations_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, variations_id }
    });
    res.status(200).json(results);
  });
});

app.patch('/product_order/:order_id', (req, res) => {
  const { order_id } = req.params;
  const {
    supplier_id,
    supplier_name,
    order_date,
    expected_delivery_date,
    product_id,
    product_name,
    variations_id,
    order_quantity,
    order_status,
    order_amount,
    created_by,
    has_payment_confirmed 
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (supplier_id) { updateFields.push('supplier_id = ?'); updateValues.push(supplier_id); }
  if (supplier_name) { updateFields.push('supplier_name = ?'); updateValues.push(supplier_name); }
  if (order_date) { updateFields.push('order_date = ?'); updateValues.push(order_date); }
  if (expected_delivery_date) { updateFields.push('expected_delivery_date = ?'); updateValues.push(expected_delivery_date); }
  if (product_id) { updateFields.push('product_id = ?'); updateValues.push(product_id); }
  if (product_name) { updateFields.push('product_name = ?'); updateValues.push(product_name); }
  if (variations_id) { updateFields.push('variations_id = ?'); updateValues.push(variations_id); }
  if (order_quantity !== undefined) { updateFields.push('order_quantity = ?'); updateValues.push(order_quantity); }
  if (order_status) { updateFields.push('order_status = ?'); updateValues.push(order_status); }
  if (order_amount !== undefined) { updateFields.push('order_amount = ?'); updateValues.push(order_amount); }
  if (created_by) { updateFields.push('created_by = ?'); updateValues.push(created_by); }
  if (has_payment_confirmed) { updateFields.push('has_payment_confirmed = ?'); updateValues.push(has_payment_confirmed); } // <-- Add this line

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE product_order SET ${updateFields.join(', ')} WHERE order_id = ?`;
  updateValues.push(order_id);

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_order',
        recordId: order_id,
        description: 'Failed to update product order',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update product order', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_order',
        recordId: order_id,
        description: 'Product order not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Product order not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'product_order',
      recordId: order_id,
      description: 'Updated product order',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { order_id }
    });
    res.status(200).json({ message: 'Product order updated', order_id });
  });
});
app.delete('/product_order/:order_id', (req, res) => {
  const { order_id } = req.params;
  const query = 'DELETE FROM product_order WHERE order_id = ?';
  connection.query(query, [order_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'product_order',
        recordId: order_id,
        description: 'Failed to delete product order',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete product order', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'product_order',
        recordId: order_id,
        description: 'Product order not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Product order not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'product_order',
      recordId: order_id,
      description: 'Deleted product order',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Product order deleted', order_id });
  });
});

app.post('/stock_modify', (req, res) => {
  const {
    adjustment_type,
    product_name,
    product_id,
    variations_id,
    size,
    adjustment_action,
    adjustment_reason,
    notes,
    date,
    performed_by
  } = req.body;

  if (
    !adjustment_type ||
    !product_name ||
    !product_id ||
    !variations_id ||
    !adjustment_action ||
    !performed_by
  ) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }

  const stock_modify_id = generateId();
  const query = `INSERT INTO stock_modify (
    stock_modify_id, adjustment_type, product_name, product_id, variations_id, size, adjustment_action, adjustment_reason, notes, date, performed_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  logActivity({
    activityType: 'CREATE',
    tableName: 'stock_modify',
    recordId: stock_modify_id,
    description: `Stock modification for product: ${product_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {
      stock_modify_id,
      adjustment_type,
      product_name,
      product_id,
      variations_id,
      size,
      adjustment_action,
      adjustment_reason,
      notes,
      date,
      performed_by
    }
  });

  connection.query(
    query,
    [
      stock_modify_id,
      adjustment_type,
      product_name,
      product_id,
      variations_id,
      size || null,
      adjustment_action,
      adjustment_reason || null,
      notes || null,
      date || new Date(),
      performed_by
    ],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'stock_modify',
          recordId: stock_modify_id,
          description: `Failed to create stock modification for product: ${product_name}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create stock modification', details: err.message });
      }
      res.status(201).json({ message: 'Stock modification created', stock_modify_id });
      logActivity({
        activityType: 'CREATE_SUCCESS',
        tableName: 'stock_modify',
        recordId: stock_modify_id,
        description: `Successfully created stock modification for product: ${product_name}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: { stock_modify_id }
      });
    }
  );
});

app.get('/stock_modify', (req, res) => {
  const query = 'SELECT * FROM stock_modify ORDER BY date DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'stock_modify',
        description: 'Failed to fetch stock modifications',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch stock modifications', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'stock_modify',
      description: 'Successfully fetched all stock modifications',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/stock_modify/:stock_modify_id', (req, res) => {
  const { stock_modify_id } = req.params;
  const query = 'SELECT * FROM stock_modify WHERE stock_modify_id = ?';
  connection.query(query, [stock_modify_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'stock_modify',
        recordId: stock_modify_id,
        description: 'Failed to fetch stock modification by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch stock modification', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'stock_modify',
        recordId: stock_modify_id,
        description: 'Stock modification not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Stock modification not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'stock_modify',
      recordId: stock_modify_id,
      description: 'Fetched stock modification by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});


app.get('/stock_modify/product/:product_id', (req, res) => {
  const { product_id } = req.params;
  const query = 'SELECT * FROM stock_modify WHERE product_id = ? ORDER BY date DESC';
  connection.query(query, [product_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'stock_modify',
        description: 'Failed to fetch stock modifications by product_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch stock modifications', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'stock_modify',
      description: `Fetched all stock modifications for product_id ${product_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, product_id }
    });
    res.status(200).json(results);
  });
});


app.get('/stock_modify/variation/:variations_id', (req, res) => {
  const { variations_id } = req.params;
  const query = 'SELECT * FROM stock_modify WHERE variations_id = ? ORDER BY date DESC';
  connection.query(query, [variations_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'stock_modify',
        description: 'Failed to fetch stock modifications by variations_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch stock modifications', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'stock_modify',
      description: `Fetched all stock modifications for variations_id ${variations_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, variations_id }
    });
    res.status(200).json(results);
  });
});

app.patch('/stock_modify/:stock_modify_id', (req, res) => {
  const { stock_modify_id } = req.params;
  const {
    adjustment_type,
    product_name,
    product_id,
    variations_id,
    size,
    adjustment_action,
    adjustment_reason,
    notes,
    date,
    performed_by
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (adjustment_type) { updateFields.push('adjustment_type = ?'); updateValues.push(adjustment_type); }
  if (product_name) { updateFields.push('product_name = ?'); updateValues.push(product_name); }
  if (product_id) { updateFields.push('product_id = ?'); updateValues.push(product_id); }
  if (variations_id) { updateFields.push('variations_id = ?'); updateValues.push(variations_id); }
  if (size) { updateFields.push('size = ?'); updateValues.push(size); }
  if (adjustment_action) { updateFields.push('adjustment_action = ?'); updateValues.push(adjustment_action); }
  if (adjustment_reason) { updateFields.push('adjustment_reason = ?'); updateValues.push(adjustment_reason); }
  if (notes) { updateFields.push('notes = ?'); updateValues.push(notes); }
  if (date) { updateFields.push('date = ?'); updateValues.push(date); }
  if (performed_by) { updateFields.push('performed_by = ?'); updateValues.push(performed_by); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE stock_modify SET ${updateFields.join(', ')} WHERE stock_modify_id = ?`;
  updateValues.push(stock_modify_id);

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'stock_modify',
        recordId: stock_modify_id,
        description: 'Failed to update stock modification',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update stock modification', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'stock_modify',
        recordId: stock_modify_id,
        description: 'Stock modification not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Stock modification not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'stock_modify',
      recordId: stock_modify_id,
      description: 'Updated stock modification',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { stock_modify_id }
    });
    res.status(200).json({ message: 'Stock modification updated', stock_modify_id });
  });
});

app.delete('/stock_modify/:stock_modify_id', (req, res) => {
  const { stock_modify_id } = req.params;
  const query = 'DELETE FROM stock_modify WHERE stock_modify_id = ?';
  connection.query(query, [stock_modify_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'stock_modify',
        recordId: stock_modify_id,
        description: 'Failed to delete stock modification',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete stock modification', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'stock_modify',
        recordId: stock_modify_id,
        description: 'Stock modification not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Stock modification not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'stock_modify',
      recordId: stock_modify_id,
      description: 'Deleted stock modification',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Stock modification deleted', stock_modify_id });
  });
});

app.post('/staff', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'document', maxCount: 1 }]), async (req, res) => {
  const {
    full_name,
    contact_no,
    email,
    address,
    position_name,
    assigned_position,
    gender,
    staff_status = 'on_job',
    date_of_birth,
    state_of_origin,
    emergency_contact,
    employment_type,
    work_shift, 
    work_days,
    start_date,
    salary,
    bank_account_number,
    bank_name,
    national_id,
    guarantor_name,
    guarantor_contact,
    guarantor_relationship,
    guarantor_address
  } = req.body;


  const shifts = work_shift ? 
    (Array.isArray(work_shift) ? work_shift : [work_shift].filter(Boolean)) 
    : null;
  const days = work_days ? 
    (Array.isArray(work_days) ? work_days.join(', ') : work_days)
    : null;

  const photo = req.files['photo'] ? req.files['photo'][0].filename : null;
  const document = req.files['document'] ? req.files['document'][0].filename : null;


  if (
    !full_name ||
    !contact_no ||
    !email ||
    !gender ||
    !date_of_birth ||
    !state_of_origin ||
    !emergency_contact ||
    !employment_type ||
    !start_date ||
    !salary ||
    !bank_account_number ||
    !bank_name ||
    !guarantor_name ||
    !guarantor_contact ||
    !guarantor_relationship ||
    !guarantor_address
  ) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }


  connection.query('SELECT staff_id FROM staff WHERE email = ? UNION SELECT id FROM admin WHERE email = ?', [email, email], (emailErr, emailResults) => {
    if (emailErr) {
      return res.status(500).json({ error: 'Error checking email', details: emailErr.message });
    }
    if (emailResults.length > 0) {
      return res.status(400).json({ error: 'Email already exists for a staff or admin' });
    }

    connection.getConnection((err, conn) => {
      if (err) return res.status(500).json({ error: 'Failed to get DB connection', details: err.message });

      conn.beginTransaction(async (err) => {
        if (err) {
          conn.release();
          return res.status(500).json({ error: 'Failed to start transaction', details: err.message });
        }

        const staff_id = generateId();
        const staffQuery = `INSERT INTO staff (
          staff_id, full_name, contact_no, email, address, document, position_name, 
          assigned_position, gender, date_of_birth, state_of_origin,
          emergency_contact, employment_type, start_date, salary, bank_account_number,
          bank_name, national_id, guarantor_name, guarantor_contact, 
          guarantor_relationship, guarantor_address, photo, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        conn.query(
          staffQuery,
          [
            staff_id,
            full_name,
            contact_no,
            email,
            address || null,
            document || null,
            position_name || null,
            assigned_position || null,
            gender,
            date_of_birth,
            state_of_origin,
            emergency_contact,
            employment_type,
            start_date,
            salary,
            bank_account_number,
            bank_name,
            national_id || null,
            guarantor_name,
            guarantor_contact,
            guarantor_relationship,
            guarantor_address,
            photo || null,
            'un_paid' 
          ],
          async (err, result) => {
            if (err) {
              return conn.rollback(() => {
                conn.release();
                logActivity({
                  activityType: 'DB_ERROR',
                  tableName: 'staff',
                  recordId: staff_id,
                  description: `Failed to create staff: ${full_name}`,
                  req,
                  significance: 'high',
                  metadata: { error: err.message }
                });
                res.status(500).json({ error: 'Failed to create staff', details: err.message });
              });
            }

            try {
              const [first_name, ...rest] = full_name.split(' ');
              const last_name = rest.join(' ') || '';
              const admin_id = generateId();
              const defaultPassword = "maskistaff1234";
              const hashedPassword = await bcrypt.hash(defaultPassword, 10);
              const admin_role = assigned_position || position_name || 'staff';

              const adminQuery = `INSERT INTO admin 
                (id, first_name, last_name, email, phone_number, password, admin_role, is_active) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

              conn.query(
                adminQuery,
                [
                  admin_id,
                  first_name,
                  last_name,
                  email,
                  contact_no,
                  hashedPassword,
                  admin_role,
                  1
                ],
                (adminErr) => {
                  if (adminErr) {
                    return conn.rollback(() => {
                      conn.release();
                      logActivity({
                        activityType: 'DB_ERROR',
                        tableName: 'admin',
                        recordId: admin_id,
                        description: `Failed to create admin for staff: ${full_name}`,
                        req,
                        significance: 'high',
                        metadata: { error: adminErr.message }
                      });
                      res.status(500).json({ error: 'Failed to create admin for staff', details: adminErr.message });
                    });
                  }

                
                  if (shifts && days) {
                    const shift_id = generateId();
                    const shiftQuery = `INSERT INTO staff_shifts (shift_id, staff_id, fullname, working_hours, work_days) 
                      VALUES (?, ?, ?, ?, ?)`;

                    conn.query(
                      shiftQuery,
                      [shift_id, staff_id, full_name, shifts.join(', '), days],
                      (shiftErr, shiftResult) => {
                        if (shiftErr) {
                          return conn.rollback(() => {
                            conn.release();
                            logActivity({
                              activityType: 'DB_ERROR',
                              tableName: 'staff_shifts',
                              recordId: shift_id,
                              description: `Failed to create staff shift for ${full_name}`,
                              req,
                              significance: 'high',
                              metadata: { error: shiftErr.message }
                            });
                            res.status(500).json({ error: 'Failed to create staff shift', details: shiftErr.message });
                          });
                        }

                        completeTransaction();
                      }
                    );
                  } else {
                    completeTransaction();
                  }

                  function completeTransaction() {
                    conn.commit((commitErr) => {
                      conn.release();
                      if (commitErr) {
                        return res.status(500).json({ error: 'Failed to commit transaction', details: commitErr.message });
                      }

    
                      const mailOptions = {
                        from: process.env.EMAIL_USER,
                        to: email,
                        subject: 'Your Staff Account Credentials',
                        text: `Hello ${first_name},\n\nYour staff/admin account has been created.\n\nLogin Email: ${email}, \n\nStaff Login Page : https://maskiadmin-management.com/staff-login/ \n\nMeet the manager or superior for your passowrd as and also request a change also.\n\nThank you.`
                      };
                      transporter.sendMail(mailOptions, (mailErr, info) => {
                        if (mailErr) {
                          logActivity({
                            activityType: 'EMAIL_ERROR',
                            tableName: 'admin',
                            recordId: admin_id,
                            description: `Failed to send password email to staff: ${email}`,
                            req,
                            significance: 'medium',
                            metadata: { error: mailErr.message }
                          });
                        }
                      });

                      res.status(201).json({ 
                        message: 'Staff created successfully', 
                        staff_id, 
                        full_name
                      });

                      logActivity({
                        activityType: 'CREATE_SUCCESS',
                        tableName: 'staff',
                        recordId: staff_id,
                        description: `Successfully created staff: ${full_name}`,
                        req,
                        significance: 'medium',
                        metadata: { staff_id, full_name }
                      });
                    });
                  }
                }
              );
            } catch (adminInsertErr) {
              return conn.rollback(() => {
                conn.release();
                logActivity({
                  activityType: 'ADMIN_CREATE_ERROR',
                  tableName: 'admin',
                  description: `Error creating admin for staff: ${full_name}`,
                  req,
                  significance: 'medium',
                  metadata: { error: adminInsertErr.message }
                });
                res.status(500).json({ error: 'Failed to create admin for staff', details: adminInsertErr.message });
              });
            }
          }
        );
      });
    });
  });
});


app.get('/staff-data', (req, res) => {
  const totalQuery = 'SELECT COUNT(*) AS total_staff_number FROM staff';
  const onJobQuery = "SELECT COUNT(*) AS total_on_job_staff FROM staff WHERE staff_status = 'on_job'";
  const suspendedTerminatedQuery = "SELECT COUNT(*) AS total_suspended_or_terminated FROM staff WHERE staff_status IN ('suspended', 'terminated')";

  Promise.all([
    new Promise((resolve, reject) => {
      connection.query(totalQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].total_staff_number);
      });
    }),
    new Promise((resolve, reject) => {
      connection.query(onJobQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].total_on_job_staff);
      });
    }),
    new Promise((resolve, reject) => {
      connection.query(suspendedTerminatedQuery, (err, results) => {
        if (err) return reject(err);
        resolve(results[0].total_suspended_or_terminated);
      });
    })
  ])
  .then(([total_staff_number, total_on_job_staff, total_suspended_or_terminated]) => {
    res.json({
      total_staff_number,
      total_on_job_staff,
      total_suspended_or_terminated
    });
  })
  .catch(err => {
    res.status(500).json({ error: 'Failed to fetch staff data', details: err.message });
  });
});

app.get('/staff', (req, res) => {
  const query = 'SELECT * FROM staff ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'staff',
        description: 'Failed to fetch staff',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch staff', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'staff',
      description: 'Successfully fetched all staff',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/staff/:staff_id', (req, res) => {
  const { staff_id } = req.params;
  const query = 'SELECT * FROM staff WHERE staff_id = ?';
  connection.query(query, [staff_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'staff',
        recordId: staff_id,
        description: 'Failed to fetch staff by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch staff', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'staff',
        recordId: staff_id,
        description: 'Staff not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Staff not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'staff',
      recordId: staff_id,
      description: 'Fetched staff by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.patch('/staff/:staff_id', upload.single('document'), async (req, res) => {
  const { staff_id } = req.params;
const {
  full_name,
  contact_no,
  email,
  address,
  position_name,
  assigned_position,
  gender,
  staff_status,
  staff_status_change_reason,
  salary,
  bank_account_number,
  bank_name,
  state_of_origin,
  emergency_contact,
  employment_type,
  date_of_birth,
  start_date,
  national_id,
  guarantor_name,
  guarantor_contact,
  guarantor_relationship,
  guarantor_address
} = req.body;

const updateFields = [];
const updateValues = [];

if (full_name) updateFields.push('full_name = ?'), updateValues.push(full_name);
if (contact_no) updateFields.push('contact_no = ?'), updateValues.push(contact_no);
if (email) updateFields.push('email = ?'), updateValues.push(email);
if (address) updateFields.push('address = ?'), updateValues.push(address);
if (position_name) updateFields.push('position_name = ?'), updateValues.push(position_name);
if (assigned_position) updateFields.push('assigned_position = ?'), updateValues.push(assigned_position);
if (gender) updateFields.push('gender = ?'), updateValues.push(gender);
if (staff_status) updateFields.push('staff_status = ?'), updateValues.push(staff_status);
if (staff_status_change_reason) updateFields.push('staff_status_change_reason = ?'), updateValues.push(staff_status_change_reason);
if (salary) updateFields.push('salary = ?'), updateValues.push(Number(salary));
if (bank_account_number) updateFields.push('bank_account_number = ?'), updateValues.push(bank_account_number);
if (bank_name) updateFields.push('bank_name = ?'), updateValues.push(bank_name);
if (state_of_origin) updateFields.push('state_of_origin = ?'), updateValues.push(state_of_origin);
if (emergency_contact) updateFields.push('emergency_contact = ?'), updateValues.push(emergency_contact);
if (employment_type) updateFields.push('employment_type = ?'), updateValues.push(employment_type);
if (date_of_birth) updateFields.push('date_of_birth = ?'), updateValues.push(date_of_birth);
if (start_date) updateFields.push('start_date = ?'), updateValues.push(start_date);
if (national_id) updateFields.push('national_id = ?'), updateValues.push(national_id);
if (guarantor_name) updateFields.push('guarantor_name = ?'), updateValues.push(guarantor_name);
if (guarantor_contact) updateFields.push('guarantor_contact = ?'), updateValues.push(guarantor_contact);
if (guarantor_relationship) updateFields.push('guarantor_relationship = ?'), updateValues.push(guarantor_relationship);
if (guarantor_address) updateFields.push('guarantor_address = ?'), updateValues.push(guarantor_address);


if (req.body.remove_photo === 'on') {
  updateFields.push('photo = NULL');
  logActivity({
    activityType: 'UPDATE',
    tableName: 'staff',
    recordId: staff_id,
    description: 'Removed staff photo',
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { staff_id, action: 'remove_photo' }
  })
}
if (req.body.remove_document === 'on') {
  updateFields.push('document = NULL');
  logActivity({
    activityType: 'UPDATE',
    tableName: 'staff',
    recordId: staff_id,
    description: 'Removed staff document',
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { staff_id, action: 'remove_document' }
  })
}

if (req.file) {
  updateFields.push('document = ?');
  updateValues.push(req.file.filename);
}
  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE staff SET ${updateFields.join(', ')} WHERE staff_id = ?`;
  updateValues.push(staff_id);

  connection.query(query, updateValues, async (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'staff',
        recordId: staff_id,
        description: 'Failed to update staff',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update staff', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'staff',
        recordId: staff_id,
        description: 'Staff not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Staff not found' });
    }

   
    if (full_name || contact_no || email || assigned_position || position_name) {
      
      connection.query('SELECT * FROM staff WHERE staff_id = ?', [staff_id], async (staffErr, staffRows) => {
        if (!staffErr && staffRows.length > 0) {
          const staff = staffRows[0];
          const [first_name, ...rest] = (full_name || staff.full_name).split(' ');
          const last_name = rest.join(' ') || '';
          const adminUpdateFields = [];
          const adminUpdateValues = [];

          if (first_name) { adminUpdateFields.push('first_name = ?'); adminUpdateValues.push(first_name); }
          if (last_name) { adminUpdateFields.push('last_name = ?'); adminUpdateValues.push(last_name); }
          if (email || staff.email) { adminUpdateFields.push('email = ?'); adminUpdateValues.push(email || staff.email); }
          if (contact_no || staff.contact_no) { adminUpdateFields.push('phone_number = ?'); adminUpdateValues.push(contact_no || staff.contact_no); }
          if (assigned_position || position_name) {
            adminUpdateFields.push('admin_role = ?');
            adminUpdateValues.push(assigned_position || position_name || staff.assigned_position || staff.position_name);
          }

          if (adminUpdateFields.length > 0) {
          
            const adminQuery = `UPDATE admin SET ${adminUpdateFields.join(', ')} WHERE email = ?`;
            adminUpdateValues.push(email || staff.email);
            connection.query(adminQuery, adminUpdateValues, (adminErr) => {
              if (adminErr) {
                logActivity({
                  activityType: 'DB_ERROR',
                  tableName: 'admin',
                  description: 'Failed to update admin linked to staff',
                  performedById: req.session?.userId || 'unknown',
                  performedByRole: req.session?.userRole || 'unknown',
                  req,
                  significance: 'high',
                  metadata: { error: adminErr.message }
                });
              }
            });
          }
        }
      });
    }

    if (staff_status) {
  const actionId = generateId();
  const insertAction = `
    INSERT INTO staff_actions (id, staff_id, action_type, action_value, reason, performed_by, performed_by_role)
    VALUES (?, ?, 'status_change', ?, ?, ?, ?)
  `;
  connection.query(
    insertAction,
    [
      actionId,
      staff_id,
      staff_status,
      staff_status_change_reason || null,
      req.session?.admin?.first_name + ' ' + req.session?.admin?.last_name || 'System',
      req.session?.admin?.admin_role || 'System'
    ]
  );
}

    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'staff',
      recordId: staff_id,
      description: 'Updated staff',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { staff_id }
    });
    res.status(200).json({ message: 'Staff updated', staff_id });
  });
});


app.delete('/staff/:staff_id', (req, res) => {
  const { staff_id } = req.params;
  const query = 'DELETE FROM staff WHERE staff_id = ?';
  connection.query(query, [staff_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'staff',
        recordId: staff_id,
        description: 'Failed to delete staff',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete staff', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'staff',
        recordId: staff_id,
        description: 'Staff not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Staff not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'staff',
      recordId: staff_id,
      description: 'Deleted staff',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Staff deleted', staff_id });
  });
});

app.get('/staff/:staff_id/actions', (req, res) => {
  const { staff_id } = req.params;
  const query = `
    SELECT 
      id,
      staff_id,
      action_type,
      action_value,
      reason,
      performed_by,
      performed_by_role,
      created_at
    FROM staff_actions
    WHERE staff_id = ?
    ORDER BY created_at DESC
  `;
  connection.query(query, [staff_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch staff actions', details: err.message });
    res.status(200).json(results);
  });
});

app.post('/staff_shifts', (req, res) => {
  const {
    staff_id,
    fullname,
    working_hours,
    work_days
  } = req.body;

  if (!staff_id || !fullname || !working_hours || !work_days) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }

  const shift_id = generateId();
  const query = `INSERT INTO staff_shifts (
    shift_id, staff_id, fullname, working_hours, work_days
  ) VALUES (?, ?, ?, ?, ?)`;

  logActivity({
    activityType: 'CREATE',
    tableName: 'staff_shifts',
    recordId: shift_id,
    description: `Created staff shift for ${fullname}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {
      shift_id,
      staff_id,
      fullname,
      working_hours,
      work_days
    }
  });

  connection.query(
    query,
    [shift_id, staff_id, fullname, working_hours, work_days],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'staff_shifts',
          recordId: shift_id,
          description: `Failed to create staff shift for ${fullname}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create staff shift', details: err.message });
      }
      res.status(201).json({ message: 'Staff shift created', shift_id, fullname });
      logActivity({
        activityType: 'CREATE_SUCCESS',
        tableName: 'staff_shifts',
        recordId: shift_id,
        description: `Successfully created staff shift for ${fullname}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: { shift_id, fullname }
      });
    }
  );
});

app.get('/staff_shifts', (req, res) => {
  const query = 'SELECT * FROM staff_shifts ORDER BY shift_id DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'staff_shifts',
        description: 'Failed to fetch staff shifts',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch staff shifts', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'staff_shifts',
      description: 'Successfully fetched all staff shifts',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/staff_shifts/staff/:staff_id', (req, res) => {
  const { staff_id } = req.params;
  const query = 'SELECT * FROM staff_shifts WHERE staff_id = ? ORDER BY shift_id DESC';
  connection.query(query, [staff_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'staff_shifts',
        description: 'Failed to fetch staff shifts by staff_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch staff shifts', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'staff_shifts',
      description: `Fetched all staff shifts for staff_id ${staff_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length, staff_id }
    });
    res.status(200).json(results);
  });
});

app.get('/staff_shifts/:shift_id', (req, res) => {
  const { shift_id } = req.params;
  const query = 'SELECT * FROM staff_shifts WHERE shift_id = ?';
  connection.query(query, [shift_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'staff_shifts',
        recordId: shift_id,
        description: 'Failed to fetch staff shift by shift_id',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch staff shift', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'staff_shifts',
        recordId: shift_id,
        description: 'Staff shift not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Staff shift not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'staff_shifts',
      recordId: shift_id,
      description: 'Fetched staff shift by shift_id',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.patch('/staff_shifts/:shift_id', (req, res) => {
  const { shift_id } = req.params;
  const {
    staff_id,
    fullname,
    working_hours,
    work_days
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (staff_id) { updateFields.push('staff_id = ?'); updateValues.push(staff_id); }
  if (fullname) { updateFields.push('fullname = ?'); updateValues.push(fullname); }
  if (working_hours) { updateFields.push('working_hours = ?'); updateValues.push(working_hours); }
  if (work_days) { updateFields.push('work_days = ?'); updateValues.push(work_days); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE staff_shifts SET ${updateFields.join(', ')} WHERE shift_id = ?`;
  updateValues.push(shift_id);

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'staff_shifts',
        recordId: shift_id,
        description: 'Failed to update staff shift',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update staff shift', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'staff_shifts',
        recordId: shift_id,
        description: 'Staff shift not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Staff shift not found' });
    }

    
    const getStaffId = staff_id
      ? Promise.resolve(staff_id)
      : new Promise((resolve, reject) => {
          connection.query(
            'SELECT staff_id FROM staff_shifts WHERE shift_id = ?',
            [shift_id],
            (err, rows) => {
              if (err || !rows.length) return resolve(null);
              resolve(rows[0].staff_id);
            }
          );
        });

    getStaffId.then(actualStaffId => {
      if (actualStaffId) {
        const actionId = generateId();
        const insertAction = `
          INSERT INTO staff_actions (id, staff_id, action_type, action_value, reason, performed_by, performed_by_role)
          VALUES (?, ?, 'shift_change', ?, ?, ?, ?)
        `;
        connection.query(
          insertAction,
          [
            actionId,
            actualStaffId,
            `${working_hours || ''} | ${work_days || ''}`,
            'Shift updated',
            req.session?.admin?.first_name + ' ' + req.session?.admin?.last_name || 'System',
            req.session?.admin?.admin_role || 'System'
          ]
        );
      }
    });

    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'staff_shifts',
      recordId: shift_id,
      description: 'Updated staff shift',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { shift_id }
    });
    res.status(200).json({ message: 'Staff shift updated', shift_id });
  });
});

app.delete('/staff_shifts/:shift_id', (req, res) => {
  const { shift_id } = req.params;
  const query = 'DELETE FROM staff_shifts WHERE shift_id = ?';
  connection.query(query, [shift_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'staff_shifts',
        recordId: shift_id,
        description: 'Failed to delete staff shift',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete staff shift', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'staff_shifts',
        recordId: shift_id,
        description: 'Staff shift not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Staff shift not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'staff_shifts',
      recordId: shift_id,
      description: 'Deleted staff shift',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Staff shift deleted', shift_id });
  });
});

app.post('/staff_docs', upload.single('file'), (req, res) => {
  const { staff_id, document_name } = req.body;
  const file = req.file ? req.file.filename : null;
  if (!staff_id || !document_name || !file) {
    return res.status(400).json({ error: 'staff_id, document_name, and file are required' });
  }
  const id = generateId();
  const query = 'INSERT INTO staff_docs (id, staff_id, document_name, file) VALUES (?, ?, ?, ?)';
  connection.query(query, [id, staff_id, document_name, file], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to upload document', details: err.message });

    if (staff_id) {
      const actionId = generateId();
      const insertAction = `
        INSERT INTO staff_actions (id, staff_id, action_type, action_value, reason, performed_by, performed_by_role)
        VALUES (?, ?, 'document_upload', ?, ?, ?, ?)
      `;
      connection.query(
        insertAction,
        [
          actionId,
          staff_id,
          document_name,
          'Document uploaded',
          req.session?.admin?.first_name + ' ' + req.session?.admin?.last_name || 'System',
          req.session?.admin?.admin_role || 'System'
        ]
      );
      
    }


    res.status(201).json({ message: 'Document uploaded', id });
  });
});

app.post('/staff_docs/sync', async (req, res) => {
 
  const query = `
    SELECT staff_id, document FROM staff
    WHERE document IS NOT NULL AND document != ''
      AND staff_id NOT IN (SELECT staff_id FROM staff_docs)
  `;
  connection.query(query, async (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch staff documents', details: err.message });
    if (!results.length) return res.json({ message: 'No documents to sync' });

    let inserted = 0;
    for (const row of results) {
      const id = generateId();
      const insertQuery = 'INSERT INTO staff_docs (id, staff_id, document_name, file) VALUES (?, ?, ?, ?)';
      await new Promise((resolve) => {
        connection.query(insertQuery, [id, row.staff_id, 'Document', row.document], () => resolve());
      });
      inserted++;
    }
    res.json({ message: `Synced ${inserted} documents from staff table to staff_docs` });
  });
});
app.get('/staff_docs/:staff_id', (req, res) => {
  const { staff_id } = req.params;
  const query = 'SELECT id, staff_id, document_name, file, created_at FROM staff_docs WHERE staff_id = ? ORDER BY created_at DESC';
  connection.query(query, [staff_id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch staff documents', details: err.message });
    }
    res.status(200).json(results);
  });
});

app.post('/staff_subcharge', (req, res) => {
  const { staff_id, sub_charge_amt, reason } = req.body;
  if (!staff_id || !sub_charge_amt) {
    return res.status(400).json({ error: 'staff_id and sub_charge_amt are required' });
  }
  const id = generateId();
  const query = 'INSERT INTO staff_subcharge (id, staff_id, sub_charge_amt, reason) VALUES (?, ?, ?, ?)';
  connection.query(query, [id, staff_id, sub_charge_amt, reason || null], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to add subcharge', details: err.message });

    const actionId = generateId();
const insertAction = `
  INSERT INTO staff_actions (id, staff_id, action_type, action_value, reason, performed_by, performed_by_role)
  VALUES (?, ?, 'subcharge', ?, ?, ?, ?)
`;
connection.query(
  insertAction,
  [
    actionId,
    staff_id,
    sub_charge_amt,
    reason || null,
    req.session?.admin?.first_name + ' ' + req.session?.admin?.last_name || 'System',
    req.session?.admin?.admin_role || 'System'
  ]
);
    res.status(201).json({ message: 'Subcharge added', id });
  });
});

app.get('/staff_subcharge/:staff_id', (req, res) => {
  const { staff_id } = req.params;
  const query = 'SELECT SUM(sub_charge_amt) AS total_subcharge FROM staff_subcharge WHERE staff_id = ?';
  connection.query(query, [staff_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch subcharge', details: err.message });
    res.json({ staff_id, total_subcharge: results[0].total_subcharge || 0 });
  });
});

app.post('/customer', (req, res) => {
  const {
    customer_fullname,
    customer_email,
    customer_contact_no,
    customer_gender,
    customer_status
  } = req.body;

  if (
    !customer_fullname ||
    !customer_email ||
    !customer_contact_no ||
    !customer_gender
  ) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }

  const customer_id = generateId();
  const query = `INSERT INTO customer (
    customer_id, customer_fullname, customer_email, customer_contact_no, customer_gender, customer_status
  ) VALUES (?, ?, ?, ?, ?, ?)`;

  logActivity({
    activityType: 'CREATE',
    tableName: 'customer',
    recordId: customer_id,
    description: `Creating new customer: ${customer_fullname}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {
      customer_id,
      customer_fullname,
      customer_email,
      customer_contact_no,
      customer_gender,
      customer_status
    }
  });

  connection.query(
    query,
    [
      customer_id,
      customer_fullname,
      customer_email,
      customer_contact_no,
      customer_gender,
      customer_status || 'new'
    ],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'customer',
          recordId: customer_id,
          description: `Failed to create customer: ${customer_fullname}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create customer', details: err.message });
      }
      res.status(201).json({ message: 'Customer created', customer_id, customer_fullname });
      logActivity({
        activityType: 'CREATE_SUCCESS',
        tableName: 'customer',
        recordId: customer_id,
        description: `Successfully created customer: ${customer_fullname}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: { customer_id, customer_fullname }
      });
    }
  );
});

app.get('/customer', (req, res) => {
  const query = 'SELECT * FROM customer ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'customer',
        description: 'Failed to fetch customers',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch customers', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'customer',
      description: 'Successfully fetched all customers',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/customer/:customer_id', (req, res) => {
  const { customer_id } = req.params;
  const query = 'SELECT * FROM customer WHERE customer_id = ?';
  connection.query(query, [customer_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'customer',
        recordId: customer_id,
        description: 'Failed to fetch customer by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch customer', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'customer',
        recordId: customer_id,
        description: 'Customer not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Customer not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'customer',
      recordId: customer_id,
      description: 'Fetched customer by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.patch('/customer/:customer_id', (req, res) => {
  const { customer_id } = req.params;
  const {
    customer_fullname,
    customer_email,
    customer_contact_no,
    customer_gender,
    customer_status
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (customer_fullname) { updateFields.push('customer_fullname = ?'); updateValues.push(customer_fullname); }
  if (customer_email) { updateFields.push('customer_email = ?'); updateValues.push(customer_email); }
  if (customer_contact_no) { updateFields.push('customer_contact_no = ?'); updateValues.push(customer_contact_no); }
  if (customer_gender) { updateFields.push('customer_gender = ?'); updateValues.push(customer_gender); }
  if (customer_status) { updateFields.push('customer_status = ?'); updateValues.push(customer_status); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE customer SET ${updateFields.join(', ')} WHERE customer_id = ?`;
  updateValues.push(customer_id);

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'customer',
        recordId: customer_id,
        description: 'Failed to update customer',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update customer', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'customer',
        recordId: customer_id,
        description: 'Customer not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Customer not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'customer',
      recordId: customer_id,
      description: 'Updated customer',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { customer_id }
    });
    res.status(200).json({ message: 'Customer updated', customer_id });
  });
});

app.delete('/customer/:customer_id', (req, res) => {
  const { customer_id } = req.params;
  const query = 'DELETE FROM customer WHERE customer_id = ?';
  connection.query(query, [customer_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'customer',
        recordId: customer_id,
        description: 'Failed to delete customer',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete customer', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'customer',
        recordId: customer_id,
        description: 'Customer not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Customer not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'customer',
      recordId: customer_id,
      description: 'Deleted customer',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Customer deleted', customer_id });
  });
});


app.post('/order', async (req, res) => {
  const {
    customer_id,
    customer_fullname,
    customer_contact_no,
    order_method,
    order_details, 
    total_order_amount,
    tax,
    payment_method,
    split_details,
    status,
    discount,
    cashier_name
  } = req.body;

  let finalCustomerId = customer_id;
  if (!customer_id) {
    finalCustomerId = generateId();
    const customerQuery = `INSERT INTO customer (customer_id, customer_fullname, customer_contact_no) VALUES (?, ?, ?)`;
    try {
      await new Promise((resolve, reject) => {
        connection.query(customerQuery, [finalCustomerId, customer_fullname, customer_contact_no], (custErr) => {
          if (custErr && custErr.code !== 'ER_DUP_ENTRY') return reject(custErr);
          resolve();
        });
      });
    } catch (custErr) {
      return res.status(500).json({ error: 'Failed to create customer', details: custErr.message });
    }
  }

  if (
    !customer_fullname ||
    !customer_contact_no ||
    !order_method ||
    !Array.isArray(order_details) ||
    order_details.length === 0 ||
    !total_order_amount ||
    !payment_method
  ) {
    return res.status(400).json({ error: 'Required fields are missing or invalid' });
  }

  const validMethods = ["cash", "bank_transfer", "credit_card", "split"];
  if (!validMethods.includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  if (payment_method === "split") {
    const sum = split_details.reduce((acc, s) => acc + Number(s.amount), 0);
    if (Math.abs(sum - total_order_amount) > 0.01) {
      return res.status(400).json({ error: 'Split amounts do not sum to total' });
    }
  }

  const order_id = generateOrderId();
  const orderQuery = `INSERT INTO orders (
    order_id, customer_id, customer_fullname, customer_contact_no, order_method, total_order_amount, tax, payment_method, split_details, status, stock_subtracted, discount, cashier_name
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

 
  try {
   
    const variationsToFetch = order_details
      .filter(item => item.variations_id)
      .map(item => item.variations_id);

    let costPriceMap = {};
    if (variationsToFetch.length > 0) {
      const [rows] = await connection.promise().query(
        `SELECT variations_id, cost_price FROM product_variations WHERE variations_id IN (?)`,
        [variationsToFetch]
      );
      rows.forEach(row => {
        costPriceMap[row.variations_id] = row.cost_price;
      });
    }

    
    const detailsValues = order_details.map(item => [
      generateId(),
      order_id,
      item.product_id || null,
      item.product_name || null,
      item.variations_id || null,
      
      item.cost_price !== undefined && item.cost_price !== null
        ? item.cost_price
        : (item.variations_id ? costPriceMap[item.variations_id] || 0 : 0),
      item.selling_price || null,
      item.variation_image || null,
      item.quantity
    ]);

  
    connection.query(
      orderQuery,
      [
        order_id,
        finalCustomerId,
        customer_fullname,
        customer_contact_no,
        order_method,
        total_order_amount,
        tax || 0,
        payment_method,
        split_details ? JSON.stringify(split_details) : null,
        status || 'order_made',
        1,
        discount !== undefined ? discount : 0.00,
        cashier_name || 'System'
      ],
      (err, result) => {
        if (err) {
          logActivity({
            activityType: 'DB_ERROR',
            tableName: 'orders',
            recordId: order_id,
            description: `Failed to create order for ${customer_fullname}`,
            req,
            significance: 'high',
            metadata: { error: err.message }
          });
          return res.status(500).json({ error: 'Failed to create order', details: err.message });
        }

        logActivity({
          activityType: 'CREATE',
          tableName: 'orders',
          recordId: order_id,
          description: `Creating order for ${customer_fullname}`,
          req,
          significance: 'medium',
          metadata: {
            order_id,
            customer_id: finalCustomerId,
            customer_fullname,
            customer_contact_no,
            order_method,
            total_order_amount,
            tax,
            payment_method,
            status
          }
        });

        const detailsQuery = `INSERT INTO order_details (
          order_details_id, order_id, product_id, product_name, variations_id, cost_price, selling_price, variation_image, quantity
        ) VALUES ?`;

        connection.query(detailsQuery, [detailsValues], (detailsErr, detailsResult) => {
          if (detailsErr) {
            logActivity({
              activityType: 'DB_ERROR',
              tableName: 'order_details',
              recordId: order_id,
              description: `Failed to create order details for order: ${order_id}`,
              req,
              significance: 'high',
              metadata: { error: detailsErr.message }
            });
            return res.status(500).json({ error: 'Failed to create order details', details: detailsErr.message });
          }

          order_details.forEach(item => {
            if (item.product_id) {
              connection.query(
                'UPDATE product SET current_product_stock_qty_number = current_product_stock_qty_number - ? WHERE product_id = ?',
                [item.quantity, item.product_id]
              );
            }
            if (item.variations_id) {
              connection.query(
                'UPDATE product_variations SET current_variations_stock_qty_number = current_variations_stock_qty_number - ? WHERE variations_id = ?',
                [item.quantity, item.variations_id]
              );
            }
            const stock_modify_id = generateId();
            const stockModifyQuery = `INSERT INTO stock_modify (
              stock_modify_id, adjustment_type, product_name, product_id, variations_id, size, adjustment_action, adjustment_reason, notes, date, performed_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            connection.query(
              stockModifyQuery,
              [
                stock_modify_id,
                'Sold Stock',
                item.product_name || '', 
                item.product_id || null,
                item.variations_id || null,
                item.quantity || null,
                'decrease', 
                `Sold to ${customer_fullname}`, 
                `Sold to ${customer_fullname}`,
                new Date(), 
                cashier_name || 'System'
              ]
            );
          });

          logActivity({
            activityType: 'CREATE_SUCCESS',
            tableName: 'orders',
            recordId: order_id,
            description: `Order created for ${customer_fullname}`,
            req,
            significance: 'medium',
            metadata: { order_id, customer_fullname }
          });

          res.status(201).json({ message: 'Order created', order_id });
        });
      }
    );
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
});

app.get('/order', (req, res) => {
  const { page = 1, limit = 10, search = '', filter = '', start = '', end = '' } = req.query;
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1';
  const params = [];

  if (search) {
    where += ` AND (customer_fullname LIKE ? OR customer_contact_no LIKE ? OR order_method LIKE ? OR payment_method LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const today = new Date();
  const startOfToday = new Date(today.setHours(0, 0, 0, 0));
  const endOfToday = new Date(today.setHours(23, 59, 59, 999));

  if (filter === 'today') {
    where += ` AND DATE(created_at) = CURDATE()`;
  } else if (filter === 'yesterday') {
    where += ` AND DATE(created_at) = CURDATE() - INTERVAL 1 DAY`;
  } else if (filter === 'last7days') {
    where += ` AND DATE(created_at) >= CURDATE() - INTERVAL 7 DAY`;
  } else if (filter === 'thismonth') {
    where += ` AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())`;
  } else if (filter === 'custom' && start && end) {
    where += ` AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(start, end);
  }

  const countQuery = `SELECT COUNT(*) as total FROM orders ${where}`;
  const dataQuery = `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;

  connection.query(countQuery, params, (err, countResult) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to count orders', details: err.message });
    }

    const total = countResult[0].total;

    connection.query(dataQuery, [...params, Number(limit), Number(offset)], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
      }

      res.json({ total, orders: rows });
    });
  });
});


app.get('/order/:order_id', (req, res) => {
  const { order_id } = req.params;
  logActivity({
    activityType: 'FETCH_ONE',
    tableName: 'orders',
    recordId: order_id,
    description: `Fetching order with ID ${order_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = 'SELECT * FROM orders WHERE order_id = ?';
  connection.query(query, [order_id], (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'orders',
      description: `Executing query to fetch order with ID ${order_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'orders',
      description: 'Received results from database query for order',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { count: results.length, order_id }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch order', details: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Order not found' });
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'orders',
      recordId: order_id,
      description: `Successfully fetched order with ID ${order_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.get('/order/:order_id/order_details', (req, res) => {
  const { order_id } = req.params;
  logActivity({
    activityType: 'FETCH_ORDER_DETAILS_BY_ORDER',
    tableName: 'order_details',
    recordId: order_id,
    description: `Fetching all order details for order_id: ${order_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { order_id }
  });
  const query = 'SELECT * FROM order_details WHERE order_id = ?';
  connection.query(query, [order_id], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch order details', details: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'No order details found for this order' });
    }
    res.status(200).json(results);
  });
});

app.get('/order/customer/:customer_id', (req, res) => {
  const { customer_id } = req.params;
  logActivity({
    activityType: 'FETCH_BY_CUSTOMER',
    tableName: 'orders',
    recordId: customer_id,
    description: `Fetching orders for customer with ID ${customer_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = 'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC';
  connection.query(query, [customer_id], (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'orders',
      description: `Executing query to fetch orders for customer with ID ${customer_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'orders',
      description: 'Received results from database query for customer orders',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { count: results.length, customer_id }
    });
    res.status(200).json(results);
  });
});


app.get('/order/order_details/:order_details_id', (req, res) => {
  const { order_details_id } = req.params;
  logActivity({
    activityType: 'FETCH_ORDER_DETAILS',
    tableName: 'order_details',
    recordId: order_details_id,
    description: `Fetching order details with ID ${order_details_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = 'SELECT * FROM order_details WHERE order_details_id = ?';
  connection.query(query, [order_details_id], (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'order_details',
      description: `Executing query to fetch order details with ID ${order_details_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch order details', details: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Order details not found' });
    logActivity({
      activityType: 'FETCH_ORDER_DETAILS_SUCCESS',
      tableName: 'order_details',
      recordId: order_details_id,
      description: `Successfully fetched order details with ID ${order_details_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});


app.get('/order/order_details/:order_id/:product_id', (req, res) => {
  const { order_id, product_id } = req.params;

  logActivity({
    activityType: 'FETCH_ORDER_DETAILS_BY_PRODUCT',
    tableName: 'order_details',
    recordId: `${order_id}-${product_id}`,
    description: `Fetching order details for order ID ${order_id} and product ID ${product_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = 'SELECT * FROM order_details WHERE order_id = ? AND product_id = ?';
  connection.query(query, [order_id, product_id], (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'order_details',
      description: `Executing query to fetch order details for order ID ${order_id} and product ID ${product_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch order details', details: err.message });
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'order_details',
      description: 'Received results from database query for order details by product',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { count: results.length, order_id, product_id }
    });
    res.status(200).json(results);
  });
});
app.get('/order/order_details/:order_id/variation/:variations_id', (req, res) => {
  const { order_id, variations_id } = req.params;
  logActivity({
    activityType: 'FETCH_ORDER_DETAILS_BY_VARIATION',
    tableName: 'order_details',
    recordId: `${order_id}-${variations_id}`,
    description: `Fetching order details for order ID ${order_id} and variation ID ${variations_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = 'SELECT * FROM order_details WHERE order_id = ? AND variations_id = ?';
  connection.query(query, [order_id, variations_id], (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'order_details',
      description: `Executing query to fetch order details for order ID ${order_id} and variation ID ${variations_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch order details', details: err.message });
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'order_details',
      description: 'Received results from database query for order details by variation',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { count: results.length, order_id, variations_id }
    });
    res.status(200).json(results);
  });
});

app.patch('/order/:order_id', (req, res) => {
  const { order_id } = req.params;
  const {
    customer_id,
    customer_fullname,
    customer_contact_no,
    order_method,
    total_order_amount,
    tax,
    payment_method,
    status,
    discount
  } = req.body;

  logActivity({
    activityType: 'UPDATE_ORDER',
    tableName: 'orders',
    recordId: order_id,
    description: `Updating order with ID ${order_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });

  const updateFields = [];
  const updateValues = [];

  if (customer_id) { updateFields.push('customer_id = ?'); updateValues.push(customer_id); }
  if (customer_fullname) { updateFields.push('customer_fullname = ?'); updateValues.push(customer_fullname); }
  if (customer_contact_no) { updateFields.push('customer_contact_no = ?'); updateValues.push(customer_contact_no); }
  if (order_method) { updateFields.push('order_method = ?'); updateValues.push(order_method); }
  if (total_order_amount !== undefined) { updateFields.push('total_order_amount = ?'); updateValues.push(total_order_amount); }
  if (tax !== undefined) { updateFields.push('tax = ?'); updateValues.push(tax); }
  if (payment_method) { updateFields.push('payment_method = ?'); updateValues.push(payment_method); }
  if (status) { updateFields.push('status = ?'); updateValues.push(status); }
  if (discount !== undefined) { updateFields.push('discount = ?'); updateValues.push(discount); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  logActivity({
    activityType: 'DB_QUERY',
    tableName: 'orders',
    description: `Preparing to update order with ID ${order_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'low',
    metadata: { updateFields, updateValues }
  });

  const query = `UPDATE orders SET ${updateFields.join(', ')} WHERE order_id = ?`;
  updateValues.push(order_id);

  connection.query(query, updateValues, (err, result) => {
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'orders',
      description: 'Received result from update order query',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { affectedRows: result.affectedRows, order_id }
    });
    if (err) return res.status(500).json({ error: 'Failed to update order', details: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Order not found' });
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'orders',
      recordId: order_id,
      description: `Successfully updated order with ID ${order_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { order_id }
    });
    res.status(200).json({ message: 'Order updated', order_id });
  });
});


app.delete('/order/:order_id', (req, res) => {
  const { order_id } = req.params;
  logActivity({
    activityType: 'DELETE_ORDER',
    tableName: 'orders',
    recordId: order_id,
    description: `Deleting order with ID ${order_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = 'DELETE FROM orders WHERE order_id = ?';
  connection.query(query, [order_id], (err, result) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'orders',
      description: `Executing query to delete order with ID ${order_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to delete order', details: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Order not found' });
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'orders',
      recordId: order_id,
      description: `Successfully deleted order with ID ${order_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { order_id }
    });
    res.status(200).json({ message: 'Order deleted', order_id });
  });
});

app.get('/online_order_data', async (req, res) => {
  try {
   
    const [fuelCatRows] = await connection.promise().query(
      "SELECT category_id FROM product_category WHERE LOWER(category_name) = 'fuel' LIMIT 1"
    );
    if (!fuelCatRows.length) return res.status(404).json({ error: 'Fuel category not found' });
    const fuelCategoryId = fuelCatRows[0].category_id;

 
    const [fuelOrders] = await connection.promise().query(`
      SELECT COUNT(DISTINCT o.order_id) AS fuel_online_orders
      FROM orders o
      JOIN order_details od ON o.order_id = od.order_id
      JOIN product_variations pv ON od.variations_id = pv.variations_id
      JOIN product p ON pv.product_id = p.product_id
      WHERE o.order_method = 'online_order' AND p.category_id = ?
    `, [fuelCategoryId]);

    
    const [nonFuelOrders] = await connection.promise().query(`
      SELECT COUNT(DISTINCT o.order_id) AS non_fuel_online_orders
      FROM orders o
      JOIN order_details od ON o.order_id = od.order_id
      JOIN product_variations pv ON od.variations_id = pv.variations_id
      JOIN product p ON pv.product_id = p.product_id
      WHERE o.order_method = 'online_order' AND p.category_id != ?
    `, [fuelCategoryId]);

    res.json({
      fuel_online_orders: Number(fuelOrders[0].fuel_online_orders) || 0,
      non_fuel_online_orders: Number(nonFuelOrders[0].non_fuel_online_orders) || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch online order data', details: err.message });
  }
});

// cron.schedule('*/2 * * * *', () => {
//   connection.query('SELECT COUNT(*) AS count FROM orders', (countErr, countResult) => {
//     if (countErr) {
//       logActivity({
//         activityType: 'CRON_JOB_ERROR',
//         tableName: 'orders',
//         description: 'Failed to count orders before running cron job',
//         performedById: 'system',
//         performedByRole: 'cron_job',
//         req: null,
//         significance: 'high',
//         metadata: { error: countErr.message }
//       });
//       return;
//     }
//     if (countResult[0].count === 0) {
//       logActivity({
//         activityType: 'CRON_JOB_SKIP',
//         tableName: 'orders',
//         description: 'No orders found, skipping cron job',
//         performedById: 'system',
//         performedByRole: 'cron_job',
//         req: null,
//         significance: 'low',
//         metadata: {}
//       });
//       return;
//     }
//     logActivity({
//       activityType: 'CRON_JOB',
//       tableName: 'orders',
//       description: 'Running cron job to cancel orders older than 5 hours and update stock',
//       performedById: 'system',
//       performedByRole: 'cron_job',
//       req: null,
//       significance: 'low',
//       metadata: {}
//     });

//     const selectOrdersQuery = `
//       SELECT order_id FROM orders
//       WHERE status = 'order_made'
//         AND TIMESTAMPDIFF(HOUR, created_at, NOW()) >= 5
//     `;
//     connection.query(selectOrdersQuery, async (err, orders) => {
//       if (err) {
//         logActivity({
//           activityType: 'CRON_JOB_ERROR',
//           tableName: 'orders',
//           description: 'Failed to select orders for cancellation',
//           performedById: 'system',
//           performedByRole: 'cron_job',
//           req: null,
//           significance: 'high',
//           metadata: { error: err.message }
//         });
//         return;
//       }

//       if (orders.length > 0) {
//         for (const order of orders) {
//           const orderId = order.order_id;
//           const detailsQuery = 'SELECT * FROM order_details WHERE order_id = ?';
//           connection.query(detailsQuery, [orderId], (detailsErr, details) => {
//             if (detailsErr) return;
//             details.forEach(item => {
//               if (item.product_id) {
//                 connection.query(
//                   'UPDATE product SET current_product_stock_qty_number = current_product_stock_qty_number + ? WHERE product_id = ?',
//                   [item.quantity, item.product_id]
//                 );
//               }
//               if (item.variations_id) {
//                 connection.query(
//                   'UPDATE product_variations SET current_variations_stock_qty_number = current_variations_stock_qty_number + ? WHERE variations_id = ?',
//                   [item.quantity, item.variations_id]
//                 );
//               }
//             });
//           });
//         }
//       }

//       const updateOrdersQuery = `
//         UPDATE orders
//         SET status = 'order_cancelled'
//         WHERE status = 'order_made'
//           AND TIMESTAMPDIFF(HOUR, created_at, NOW()) >= 5
//       `;
//       connection.query(updateOrdersQuery, (err, result) => {
//         if (err) {
//           logActivity({
//             activityType: 'CRON_JOB_ERROR',
//             tableName: 'orders',
//             description: 'Failed to update order status in cron job',
//             performedById: 'system',
//             performedByRole: 'cron_job',
//             req: null,
//             significance: 'high',
//             metadata: { error: err.message }
//           });
//           console.error('Cron job failed to update order status:', err.message);
//         } else if (result.affectedRows > 0) {
//           logActivity({
//             activityType: 'CRON_JOB_SUCCESS',
//             tableName: 'orders',
//             description: `Cancelled ${result.affectedRows} orders after 5 hours`,
//             performedById: 'system',
//             performedByRole: 'cron_job',
//             req: null,
//             significance: 'medium',
//             metadata: { affectedRows: result.affectedRows }
//           });
//           console.log(`Cron job: Cancelled ${result.affectedRows} orders after 5 hours.`);
//         }
//       });
//     });
//   });
// });

app.get('/dashboard_sales_summary', async (req, res) => {
  try {

    const { range, start, end } = req.query;
    let dateFilter = '';
    let params = [];

    if (range === 'today') {
      dateFilter = "AND DATE(o.created_at) = CURDATE()";
    } else if (range === 'yesterday') {
      dateFilter = "AND DATE(o.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
    } else if (range === 'last7days') {
      dateFilter = "AND DATE(o.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
    } else if (range === 'thismonth') {
      dateFilter = "AND MONTH(o.created_at) = MONTH(CURDATE()) AND YEAR(o.created_at) = YEAR(CURDATE())";
    } else if (range === 'custom' && start && end) {
      dateFilter = "AND DATE(o.created_at) BETWEEN ? AND ?";
      params.push(start, end);
    }

  
    const [fuelCategory] = await connection.promise().query(
      "SELECT category_id FROM product_category WHERE LOWER(category_name) = 'fuel' LIMIT 1"
    );
    if (!fuelCategory.length) return res.status(404).json({ error: 'Fuel category not found' });
    const fuelCategoryId = fuelCategory[0].category_id;

    const [fuelStats] = await connection.promise().query(`
      SELECT 
        SUM(pv.current_variations_stock_qty_number) AS total_fuel_stock,
        COALESCE(SUM(od.quantity),0) AS total_fuel_sold_qty,
        COALESCE(SUM(od.quantity * od.selling_price),0) AS total_fuel_sales
      FROM product_variations pv
      JOIN product p ON pv.product_id = p.product_id
      LEFT JOIN order_details od ON od.variations_id = pv.variations_id
      LEFT JOIN orders o ON od.order_id = o.order_id
      WHERE p.category_id = ?
      ${dateFilter}
    `, [fuelCategoryId, ...params]);


    const [otherStats] = await connection.promise().query(`
      SELECT 
        SUM(pv.current_variations_stock_qty_number) AS total_other_stock,
        COALESCE(SUM(od.quantity),0) AS total_other_sold_qty,
        COALESCE(SUM(od.quantity * od.selling_price),0) AS total_other_sales
      FROM product_variations pv
      JOIN product p ON pv.product_id = p.product_id
      LEFT JOIN order_details od ON od.variations_id = pv.variations_id
      LEFT JOIN orders o ON od.order_id = o.order_id
      WHERE p.category_id != ?
      ${dateFilter}
    `, [fuelCategoryId, ...params]);

    
    const [paymentRows] = await connection.promise().query(`
      SELECT o.payment_method, COUNT(*) AS count
      FROM orders o
      WHERE 1=1 ${dateFilter.replace(/o\./g, 'o.')}
      GROUP BY o.payment_method
    `, params);
    const paymentTotal = paymentRows.reduce((sum, r) => sum + r.count, 0) || 1;
    const paymentRatio = {};
    paymentRows.forEach(r => {
      paymentRatio[r.payment_method] = Number(((r.count / paymentTotal) * 100).toFixed(2));
    });


    const [salesGraphRows] = await connection.promise().query(`
      SELECT 
        HOUR(o.created_at) AS hour,
        SUM(CASE WHEN p.category_id = ? THEN od.quantity * od.selling_price ELSE 0 END) AS fuel_sales,
        SUM(CASE WHEN p.category_id != ? THEN od.quantity * od.selling_price ELSE 0 END) AS other_sales
      FROM order_details od
      JOIN orders o ON od.order_id = o.order_id
      JOIN product_variations pv ON od.variations_id = pv.variations_id
      JOIN product p ON pv.product_id = p.product_id
      WHERE 1=1 ${dateFilter}
      GROUP BY hour
      ORDER BY hour
    `, [fuelCategoryId, fuelCategoryId, ...params]);
    const salesGraph = salesGraphRows.map(row => ({
      hour: row.hour !== null ? `${row.hour}:00` : 'N/A',
      fuel: Number(row.fuel_sales) || 0,
      others: Number(row.other_sales) || 0
    }));

   
    const [orderMethodRows] = await connection.promise().query(`
      SELECT o.order_method, COUNT(*) AS count
      FROM orders o
      WHERE 1=1 ${dateFilter.replace(/o\./g, 'o.')}
      GROUP BY o.order_method
    `, params);
    const orderMethodTotal = orderMethodRows.reduce((sum, r) => sum + r.count, 0) || 1;
    const orderMethodDonut = {};
    orderMethodRows.forEach(r => {
      orderMethodDonut[r.order_method] = Number(((r.count / orderMethodTotal) * 100).toFixed(2));
    });

const [topProducts] = await connection.promise().query(`
  SELECT 
    pv.variations_id,
    pv.product_name,
    pv.current_variations_stock_qty_number,
    pv.selling_price,
    pv.variation_image,
    p.unit_name,
    attrs.variation,
    SUM(od.quantity) AS total_sold,
    SUM(od.quantity * od.selling_price) AS total_sales
  FROM order_details od
  JOIN product_variations pv ON od.variations_id = pv.variations_id
  JOIN product p ON pv.product_id = p.product_id
  LEFT JOIN (
    SELECT 
      va.variations_id,
      GROUP_CONCAT(DISTINCT av.value ORDER BY a.attribute_name SEPARATOR '-') AS variation
    FROM variation_attributes va
    JOIN attribute a ON va.attribute_id = a.attribute_id
    JOIN attribute_values av ON va.value_id = av.value_id
    GROUP BY va.variations_id
  ) attrs ON pv.variations_id = attrs.variations_id
  LEFT JOIN orders o ON od.order_id = o.order_id
  WHERE 1=1 ${dateFilter}
  GROUP BY pv.variations_id, pv.product_name, pv.current_variations_stock_qty_number, pv.selling_price, pv.variation_image, p.unit_name, attrs.variation
  ORDER BY total_sold DESC
  LIMIT 3
`, params);

   
const formattedTopProducts = topProducts.map(row => ({
  product_name: row.product_name,
  variation: row.variation || '',
  current_qty: Number(row.current_variations_stock_qty_number) || 0,
  unit_price: Number(row.selling_price) || 0,
  total_sales: Number(row.total_sales) || 0,
  total_sold: `${Number(row.total_sold) || 0}${row.unit_name ? ' ' + row.unit_name : ''}`,
  variation_image: row.variation_image
}));

    res.json({
      total_fuel_data: {
        stock: Number(fuelStats[0].total_fuel_stock) || 0,
        sold_qty: Number(fuelStats[0].total_fuel_sold_qty) || 0,
        sales: Number(fuelStats[0].total_fuel_sales) || 0
      },
      total_other_stock_data: {
        stock: Number(otherStats[0].total_other_stock) || 0,
        sold_qty: Number(otherStats[0].total_other_sold_qty) || 0,
        sales: Number(otherStats[0].total_other_sales) || 0
      },
      payment_method_ratio: paymentRatio,
      sales_graph: salesGraph,
      order_method_donut: orderMethodDonut,
      top_selling_products: formattedTopProducts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard sales summary', details: err.message });
  }
});


app.post('/expense_category', (req, res) => {
  const { expense_category_name } = req.body;
  if (!expense_category_name) {
    return res.status(400).json({ error: 'expense_category_name is required' });
  }
  const expense_category_id = generateId();
  const query = 'INSERT INTO expense_category (expense_category_id, expense_category_name) VALUES (?, ?)';
  logActivity({
    activityType: 'CREATE',
    tableName: 'expense_category',
    recordId: expense_category_id,
    description: `Creating new expense category: ${expense_category_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { expense_category_id, expense_category_name }
  });
  connection.query(query, [expense_category_id, expense_category_name], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'expense_category',
        recordId: expense_category_id,
        description: `Failed to create expense category: ${expense_category_name}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to create expense category', details: err.message });
    }
    res.status(201).json({ message: 'Expense category created', expense_category_id, expense_category_name });
    logActivity({
      activityType: 'CREATE_SUCCESS',
      tableName: 'expense_category',
      recordId: expense_category_id,
      description: `Successfully created expense category: ${expense_category_name}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { expense_category_id, expense_category_name }
    });
  });
});


app.get('/expense_category', (req, res) => {
  const query = 'SELECT * FROM expense_category ORDER BY expense_category_name ASC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'expense_category',
        description: 'Failed to fetch expense categories',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch expense categories', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'expense_category',
      description: 'Successfully fetched all expense categories',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});


app.get('/expense_category/:expense_category_id', (req, res) => {
  const { expense_category_id } = req.params;
  const query = 'SELECT * FROM expense_category WHERE expense_category_id = ?';
  connection.query(query, [expense_category_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'expense_category',
        recordId: expense_category_id,
        description: 'Failed to fetch expense category by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch expense category', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'expense_category',
        recordId: expense_category_id,
        description: 'Expense category not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Expense category not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'expense_category',
      recordId: expense_category_id,
      description: 'Fetched expense category by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});


app.patch('/expense_category/:expense_category_id', (req, res) => {
  const { expense_category_id } = req.params;
  const { expense_category_name } = req.body;
  if (!expense_category_name) {
    return res.status(400).json({ error: 'expense_category_name is required' });
  }
  const query = 'UPDATE expense_category SET expense_category_name = ? WHERE expense_category_id = ?';
  connection.query(query, [expense_category_name, expense_category_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'expense_category',
        recordId: expense_category_id,
        description: 'Failed to update expense category',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update expense category', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'expense_category',
        recordId: expense_category_id,
        description: 'Expense category not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Expense category not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'expense_category',
      recordId: expense_category_id,
      description: 'Updated expense category',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { expense_category_id, expense_category_name }
    });
    res.status(200).json({ message: 'Expense category updated', expense_category_id, expense_category_name });
  });
});


app.delete('/expense_category/:expense_category_id', (req, res) => {
  const { expense_category_id } = req.params;
  const query = 'DELETE FROM expense_category WHERE expense_category_id = ?';
  connection.query(query, [expense_category_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'expense_category',
        recordId: expense_category_id,
        description: 'Failed to delete expense category',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete expense category', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'expense_category',
        recordId: expense_category_id,
        description: 'Expense category not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Expense category not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'expense_category',
      recordId: expense_category_id,
      description: 'Deleted expense category',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Expense category deleted', expense_category_id });
  });
});


app.post('/expense', upload.single('receipt'), (req, res) => {
  const {
    expense_category_id,
    expense_category_name,
    description,
    date,
    amount,
    payment_method = 'cash',
    subcharge = null 
  } = req.body;

  const receipt = req.file ? req.file.filename : null;

  if (!expense_category_id || !expense_category_name || !date || !amount) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }

  const validPaymentMethods = ['bank_transfer', 'cheque', 'mobile_money', 'cash'];
  if (!validPaymentMethods.includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const expense_id = generateId();
  const query = `INSERT INTO expense (
    expense_id, expense_category_id, expense_category_name, description, 
    date, amount, payment_method, subcharge, receipt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  logActivity({
    activityType: 'CREATE',
    tableName: 'expense',
    recordId: expense_id,
    description: `Recording expense: ${expense_category_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { 
      expense_id, 
      expense_category_id, 
      expense_category_name, 
      amount,
      payment_method,
      subcharge,
      receipt
    }
  });

  connection.query(
    query,
    [
      expense_id, 
      expense_category_id, 
      expense_category_name, 
      description || null, 
      date, 
      amount,
      payment_method,
      subcharge,
      receipt
    ],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'expense',
          recordId: expense_id,
          description: `Failed to record expense: ${expense_category_name}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to record expense', details: err.message });
      }
      res.status(201).json({ 
        message: 'Expense recorded', 
        expense_id,
        payment_method,
        subcharge: subcharge || 0,
        receipt
      });
    }
  );
});

cron.schedule('0 0 1 * *', async () => {
  console.log('Running monthly payment status check...');
  
  try {
   
    const currentDate = new Date();
    
   
    const query = `
      UPDATE staff 
      SET payment_status = 'un_paid'
      WHERE 
        (last_payment_date IS NULL AND DATEDIFF(?, start_date) >= 30)
        OR 
        (last_payment_date IS NOT NULL AND DATEDIFF(?, last_payment_date) >= 30)
    `;
    
    const [result] = await connection.promise().query(query, [currentDate, currentDate]);
    
    console.log(`Updated payment status for ${result.affectedRows} staff members`);
    

    logActivity({
      activityType: 'CRON_JOB',
      tableName: 'staff',
      description: 'Monthly payment status update',
      metadata: {
        staffUpdated: result.affectedRows,
        date: currentDate.toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error in monthly payment check:', error);
    
    logActivity({
      activityType: 'CRON_ERROR',
      tableName: 'staff',
      description: 'Failed to update monthly payment status',
      significance: 'high',
      metadata: {
        error: error.message,
        stack: error.stack
      }
    });
  }
}, {
  scheduled: true,
  timezone: "Africa/Lagos" 
});

app.post('/expense/salary', upload.single('receipt'), (req, res) => {
  const {
    expense_category_id,
    expense_category_name,
    description,
    date,
    staff_id,
    full_name,
    amount,
    payment_method = 'cash', 
    subcharge = null 
  } = req.body;

  const receipt = req.file ? req.file.filename : null;

  if (
    !expense_category_id ||
    !expense_category_name ||
    !date ||
    !amount ||
    !staff_id ||
    !full_name
  ) {
    return res.status(400).json({ error: 'Required fields are missing for salary expense' });
  }

  const validPaymentMethods = ['bank_transfer', 'cheque', 'mobile_money', 'cash'];
  if (!validPaymentMethods.includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const expense_id = generateId();
  const query = `INSERT INTO expense (
    expense_id, expense_category_id, expense_category_name, description, 
    date, staff_id, full_name, amount, payment_method, subcharge, receipt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  logActivity({
    activityType: 'CREATE',
    tableName: 'expense',
    recordId: expense_id,
    description: `Recording salary expense for staff: ${full_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { 
      expense_id, 
      expense_category_id, 
      expense_category_name, 
      staff_id, 
      full_name, 
      amount,
      payment_method,
      subcharge,
      receipt
    }
  });

  connection.query(
    query,
    [
      expense_id, 
      expense_category_id, 
      expense_category_name, 
      description || null, 
      date, 
      staff_id, 
      full_name, 
      amount,
      payment_method,
      subcharge,
      receipt
    ],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'expense',
          recordId: expense_id,
          description: `Failed to record salary expense for staff: ${full_name}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to record salary expense', details: err.message });
      }
      res.status(201).json({ 
        message: 'Salary expense recorded', 
        expense_id,
        payment_method,
        subcharge: subcharge || 0,
        receipt
      });
    }
  );
});

app.post('/staff/:staff_id/payment', async (req, res) => {
  const { staff_id } = req.params;
  const { payment_status, amount_paid, full_name, payment_method, subcharge, expense_category_id } = req.body;

  if (!payment_status || !['paid', 'un_paid', 'paid_half'].includes(payment_status)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }

  try {
    const now = new Date();


    const updateQuery = `
      UPDATE staff 
      SET payment_status = ?, last_payment_date = ?
      WHERE staff_id = ?
    `;
    await connection.promise().query(updateQuery, [payment_status, now, staff_id]);

   
    const expense_id = generateId();
    await connection.promise().query(`
      INSERT INTO expense (
        expense_id, expense_category_id, expense_category_name, 
        description, date, staff_id, full_name, amount,
        payment_method, subcharge
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      expense_id,
      expense_category_id,
      'Salary',
      `Salary payment for staff ${staff_id}`,
      now,
      staff_id,
      full_name || 'Unknown',
      amount_paid,
      payment_method || 'bank_transfer',
      subcharge || null
    ]);

  
    await connection.promise().query(
      'DELETE FROM staff_subcharge WHERE staff_id = ?',
      [staff_id]
    );

    res.json({
      message: 'Payment processed and subcharges cleared',
      payment_status,
      last_payment_date: now.toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to update payment status',
      details: error.message
    });
  }
});



app.get('/expense', (req, res) => {
  logActivity({
    activityType: 'FETCH_ALL',
    tableName: 'expense',
    description: 'Fetching all expenses excluding salary',
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = `
    SELECT * FROM expense
    WHERE expense_category_name != 'salary'
    ORDER BY date DESC
  `;
  connection.query(query, (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'expense',
      description: 'Executing query to fetch all expenses excluding salary',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch expenses', details: err.message });
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'expense',
      description: 'Received results from database query for expenses',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});


app.get('/expense/salary', (req, res) => {
  logActivity({
    activityType: 'FETCH_SALARY_EXPENSES',
    tableName: 'expense',
    description: 'Fetching all salary expenses',
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = `
    SELECT * FROM expense
    WHERE expense_category_name = 'salary'
    ORDER BY date DESC
  `;
  connection.query(query, (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'expense',
      description: 'Executing query to fetch all salary expenses',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch salary expenses', details: err.message });
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'expense',
      description: 'Received results from database query for salary expenses',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});

app.get('/expense/:expense_id', (req, res) => {
  const { expense_id } = req.params;
  logActivity({
    activityType: 'FETCH_EXPENSE',
    tableName: 'expense',
    recordId: expense_id,
    description: `Fetching expense with ID ${expense_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = 'SELECT * FROM expense WHERE expense_id = ?';
  connection.query(query, [expense_id], (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'expense',
      description: `Executing query to fetch expense with ID ${expense_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch expense', details: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Expense not found' });
    logActivity({
      activityType: 'FETCH_EXPENSE_SUCCESS',
      tableName: 'expense',
      recordId: expense_id,
      description: `Successfully fetched expense with ID ${expense_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});

app.get('/expense/staff/:staff_id', (req, res) => {
  const { staff_id } = req.params;
  logActivity({
    activityType: 'FETCH_STAFF_SALARY_EXPENSES',
    tableName: 'expense',
    recordId: staff_id,
    description: `Fetching salary expenses for staff with ID ${staff_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = `
    SELECT * FROM expense
    WHERE staff_id = ? AND expense_category_name = 'salary'
    ORDER BY date DESC
  `;
  connection.query(query, [staff_id], (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'expense',
      description: `Executing query to fetch salary expenses for staff with ID ${staff_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch staff salary expenses', details: err.message });
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'expense',
      description: 'Received results from database query for staff salary expenses',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { count: results.length, staff_id }
    });
    res.status(200).json(results);
  });
});

app.patch('/expense/:expense_id', upload.single('receipt'), (req, res) => {
  const { expense_id } = req.params;
  const {
    expense_category_id,
    expense_category_name,
    description,
    date,
    staff_id,
    full_name,
    amount,
    expense_status,   
    approved_by      
  } = req.body;

  const receipt = req.file ? req.file.filename : undefined;

  const updateFields = [];
  const updateValues = [];

  logActivity({
    activityType: 'UPDATE_EXPENSE',
    tableName: 'expense',
    recordId: expense_id,
    description: `Updating expense with ID ${expense_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { expense_id, expense_category_id, expense_category_name, description, date, staff_id, full_name, amount, receipt, expense_status, approved_by }
  });

  if (!expense_id) {
    return res.status(400).json({ error: 'expense_id is required' });
  }

  if (expense_category_id) { updateFields.push('expense_category_id = ?'); updateValues.push(expense_category_id); }
  if (expense_category_name) { updateFields.push('expense_category_name = ?'); updateValues.push(expense_category_name); }
  if (description) { updateFields.push('description = ?'); updateValues.push(description); }
  if (date) { updateFields.push('date = ?'); updateValues.push(date); }
  if (staff_id) { updateFields.push('staff_id = ?'); updateValues.push(staff_id); }
  if (full_name) { updateFields.push('full_name = ?'); updateValues.push(full_name); }
  if (amount !== undefined) { updateFields.push('amount = ?'); updateValues.push(amount); }
  if (receipt !== undefined) { updateFields.push('receipt = ?'); updateValues.push(receipt); }
  if (expense_status) { updateFields.push('expense_status = ?'); updateValues.push(expense_status); }
  if (approved_by) { updateFields.push('approved_by = ?'); updateValues.push(approved_by); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  logActivity({
    activityType: 'DB_QUERY',
    tableName: 'expense',
    description: `Preparing to update expense with ID ${expense_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'low',
    metadata: { updateFields, updateValues }
  });

  const query = `UPDATE expense SET ${updateFields.join(', ')} WHERE expense_id = ?`;
  updateValues.push(expense_id);

  connection.query(query, updateValues, (err, result) => {
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'expense',
      description: 'Received result from update expense query',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { affectedRows: result.affectedRows, expense_id }
    });
    if (err) return res.status(500).json({ error: 'Failed to update expense', details: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Expense not found' });
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'expense',
      recordId: expense_id,
      description: `Successfully updated expense with ID ${expense_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { expense_id }
    });
    res.status(200).json({ message: 'Expense updated', expense_id });
  });
});

app.delete('/expense/:expense_id', (req, res) => {
  const { expense_id } = req.params;
  logActivity({
    activityType: 'DELETE_EXPENSE',
    tableName: 'expense',
    recordId: expense_id,
    description: `Deleting expense with ID ${expense_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: {}
  });
  const query = 'DELETE FROM expense WHERE expense_id = ?';
  connection.query(query, [expense_id], (err, result) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'expense',
      description: `Executing query to delete expense with ID ${expense_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to delete expense', details: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Expense not found' });
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'expense',
      recordId: expense_id,
      description: `Successfully deleted expense with ID ${expense_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { expense_id }
    });
    res.status(200).json({ message: 'Expense deleted', expense_id });
  });
});

app.get('/expense_summary', async (req, res) => {
  const { period, custom_start, custom_end } = req.query;
  let where = '1=1';
  let params = [];

  function getDateRange(period) {
    const now = new Date();
    const format = d => d.toISOString().slice(0, 10);
    switch (period) {
      case 'today':
        return [`DATE(date) = CURDATE()`, []];
      case 'yesterday':
        return [`DATE(date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`, []];
      case 'last7days':
        return [`DATE(date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`, []];
      case 'month':
        return [`MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())`, []];
      case 'year':
        return [`YEAR(date) = YEAR(CURDATE())`, []];
      case 'custom':
        if (custom_start && custom_end) {
          return [`DATE(date) BETWEEN ? AND ?`, [custom_start, custom_end]];
        }
        break;
    }
    return ['', []];
  }

  const [dateWhere, dateParams] = getDateRange(period);
  if (dateWhere) {
    where += ` AND ${dateWhere}`;
    params = params.concat(dateParams);
  }

  try {

  const [totalRows] = await connection.promise().query(
  `SELECT COALESCE(SUM(amount),0) AS total_expense FROM expense WHERE ${where} AND expense_status = 'approved'`, params
);

const [topRows] = await connection.promise().query(
  `SELECT expense_category_name, COALESCE(SUM(amount),0) AS total_amount
   FROM expense WHERE ${where} AND expense_status = 'approved'
   GROUP BY expense_category_name
   ORDER BY total_amount DESC LIMIT 1`, params
);
   
    const total_expense = Number(totalRows[0].total_expense) || 0;
    const top_expense_category_value = topRows[0] || { expense_category_name: null, total_amount: 0 };

    res.json({
      total_expense,
      top_expense_category_value,
      total_recent_expense: total_expense
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expense summary', details: err.message });
  }
});

app.get('/expense_graph', async (req, res) => {
  const { period, custom_start, custom_end } = req.query;
  let groupBy = 'DATE(date)';
  let where = '1=1';
  let params = [];

  function getDateRange(period) {
    switch (period) {
      case 'today':
        return [`DATE(date) = CURDATE()`, []];
      case 'yesterday':
        return [`DATE(date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`, []];
      case 'last7days':
        return [`DATE(date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`, []];
      case 'month':
        return [`MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())`, []];
      case 'year':
        return [`YEAR(date) = YEAR(CURDATE())`, []];
      case 'custom':
        if (custom_start && custom_end) {
          return [`DATE(date) BETWEEN ? AND ?`, [custom_start, custom_end]];
        }
        break;
    }
    return ['', []];
  }

  const [dateWhere, dateParams] = getDateRange(period);
  if (dateWhere) {
    where += ` AND ${dateWhere}`;
    params = params.concat(dateParams);
  }

  try {
    const [rows] = await connection.promise().query(
      `SELECT ${groupBy} AS date, COALESCE(SUM(amount),0) AS total_amount
       FROM expense WHERE ${where} AND expense_status = 'approved'
       GROUP BY ${groupBy}
       ORDER BY date ASC`, params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expense graph data', details: err.message });
  }
});


app.get('/expense_by_category', async (req, res) => {
  const { period, custom_start, custom_end } = req.query;
  let where = '1=1';
  let params = [];

  function getDateRange(period) {
    switch (period) {
      case 'today':
        return [`DATE(date) = CURDATE()`, []];
      case 'yesterday':
        return [`DATE(date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`, []];
      case 'last7days':
        return [`DATE(date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`, []];
      case 'month':
        return [`MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())`, []];
      case 'year':
        return [`YEAR(date) = YEAR(CURDATE())`, []];
      case 'custom':
        if (custom_start && custom_end) {
          return [`DATE(date) BETWEEN ? AND ?`, [custom_start, custom_end]];
        }
        break;
    }
    return ['', []];
  }

  const [dateWhere, dateParams] = getDateRange(period);
  if (dateWhere) {
    where += ` AND ${dateWhere}`;
    params = params.concat(dateParams);
  }

  try {
    const [rows] = await connection.promise().query(
      `SELECT expense_category_name, COALESCE(SUM(amount),0) AS total_amount
       FROM expense WHERE ${where} AND expense_status = 'approved'
       GROUP BY expense_category_name
       ORDER BY total_amount DESC`, params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expense by category', details: err.message });
  }
});


app.post('/earnings', upload.single('proof'), (req, res) => {
  const {
    source,
    amount,
    received_from,
    payment_method,
    description,
    date
  } = req.body;

  const proof = req.file ? req.file.filename : null;

  if (!source || !amount || !received_from || !payment_method || !date) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }

  const earning_id = generateId();
  const query = `INSERT INTO earnings (
    earning_id, source, amount, received_from, payment_method, description, date, proof
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  logActivity({
    activityType: 'CREATE',
    tableName: 'earnings',
    recordId: earning_id,
    description: `Recording earning from ${source}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { earning_id, source, amount, received_from, payment_method, proof }
  });

  connection.query(
    query,
    [earning_id, source, amount, received_from, payment_method, description || null, date, proof],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'earnings',
          recordId: earning_id,
          description: `Failed to record earning from ${source}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to record earning', details: err.message });
      }
      res.status(201).json({ message: 'Earning recorded', earning_id, proof });
    }
  );
});


app.get('/earnings', (req, res) => {


  const query = 'SELECT * FROM earnings ORDER BY date DESC';

  logActivity({
    activityType: 'DB_QUERY',
    tableName: 'earnings',
    description: 'Executing query to fetch all earnings',
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'low',
    metadata: { query }
  });
  
  connection.query(query, (err, results) => {
    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'earnings',
      description: 'Received results from database query for earnings',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { count: results.length }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch earnings', details: err.message });

    logActivity({
      activityType: 'FETCH_ALL_SUCCESS',
      tableName: 'earnings',
      description: 'Successfully fetched all earnings',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });

    res.status(200).json(results);
  });
});


app.get('/earnings/:earning_id', (req, res) => {
  const { earning_id } = req.params;

  const query = 'SELECT * FROM earnings WHERE earning_id = ?';
  logActivity({
    activityType: 'FETCH_EARNING',
    tableName: 'earnings',
    recordId: earning_id,
    description: `Fetching earning with ID ${earning_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { earning_id }
  });
  connection.query(query, [earning_id], (err, results) => {
    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'earnings',
      description: `Executing query to fetch earning with ID ${earning_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });
    if (err) return res.status(500).json({ error: 'Failed to fetch earning', details: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Earning not found' });
    logActivity({
      activityType: 'FETCH_EARNING_SUCCESS',
      tableName: 'earnings',
      recordId: earning_id,
      description: `Successfully fetched earning with ID ${earning_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { earning_id }
    });
    res.status(200).json(results[0]);
  });
});


app.patch('/earnings/:earning_id', upload.single('proof'), (req, res) => {
  const { earning_id } = req.params;
  const {
    source,
    amount,
    received_from,
    payment_method,
    description,
    date
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (source) { updateFields.push('source = ?'); updateValues.push(source); }
  if (amount !== undefined) { updateFields.push('amount = ?'); updateValues.push(amount); }
  if (received_from) { updateFields.push('received_from = ?'); updateValues.push(received_from); }
  if (payment_method) { updateFields.push('payment_method = ?'); updateValues.push(payment_method); }
  if (description) { updateFields.push('description = ?'); updateValues.push(description); }
  if (date) { updateFields.push('date = ?'); updateValues.push(date); }
  if (req.file) {
    updateFields.push('proof = ?');
    updateValues.push(req.file.filename);
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  logActivity({
    activityType: 'UPDATE_EARNING',
    tableName: 'earnings',
    recordId: earning_id,
    description: `Updating earning with ID ${earning_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { earning_id, source, amount, received_from, payment_method, description, date }
  });

  const query = `UPDATE earnings SET ${updateFields.join(', ')} WHERE earning_id = ?`;
  updateValues.push(earning_id);

  connection.query(query, updateValues, (err, result) => {

    logActivity({
      activityType: 'DB_QUERY_RESULT',
      tableName: 'earnings',
      description: 'Received result from update earning query',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { affectedRows: result.affectedRows, earning_id }
    });

    if (err) return res.status(500).json({ error: 'Failed to update earning', details: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Earning not found' });

    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'earnings',
      recordId: earning_id,
      description: `Successfully updated earning with ID ${earning_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { earning_id }
    });
    res.status(200).json({ message: 'Earning updated', earning_id });
  });
});


app.delete('/earnings/:earning_id', (req, res) => {
  const { earning_id } = req.params;
  const query = 'DELETE FROM earnings WHERE earning_id = ?';

  logActivity({
    activityType: 'DELETE_EARNING',
    tableName: 'earnings',
    recordId: earning_id,
    description: `Deleting earning with ID ${earning_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { earning_id }
  });

  connection.query(query, [earning_id], (err, result) => {

    logActivity({
      activityType: 'DB_QUERY',
      tableName: 'earnings',
      description: `Executing query to delete earning with ID ${earning_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'low',
      metadata: { query }
    });

    if (err) return res.status(500).json({ error: 'Failed to delete earning', details: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Earning not found' });
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'earnings',
      recordId: earning_id,
      description: `Successfully deleted earning with ID ${earning_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { earning_id }
    });

    res.status(200).json({ message: 'Earning deleted', earning_id });
  });
});


app.post('/budget', (req, res) => {
  const {
    expense_category_id,
    expense_category_name,
    month,
    amount,
    date
  } = req.body;

  if (!expense_category_id || !expense_category_name || !month || !amount || !date) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }

  const budget_id = generateId();
  const query = `INSERT INTO budget (
    budget_id, expense_category_id, expense_category_name, month, amount, date
  ) VALUES (?, ?, ?, ?, ?, ?)`;

  logActivity({
    activityType: 'CREATE',
    tableName: 'budget',
    recordId: budget_id,
    description: `Creating new budget for category: ${expense_category_name}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { budget_id, expense_category_id, expense_category_name, month, amount }
  });

  connection.query(
    query,
    [budget_id, expense_category_id, expense_category_name, month, amount, date],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'budget',
          recordId: budget_id,
          description: `Failed to create budget for category: ${expense_category_name}`,
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create budget', details: err.message });
      }
      res.status(201).json({ message: 'Budget created', budget_id });
    }
  );
});

app.get('/budget', (req, res) => {
  const { page = 1, limit = 10, category, month, search } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT 
      b.budget_id, 
      b.expense_category_id, 
      b.expense_category_name as category,
      b.month,
      b.date,
      b.amount,
      CONCAT('#BUD', LPAD(b.budget_id, 3, '0')) as allocation_id,
      b.added_by as added_by,
      COALESCE(SUM(e.amount), 0) as spent,
      (b.amount - COALESCE(SUM(e.amount), 0)) as remain
    FROM budget b
    LEFT JOIN expense e ON b.expense_category_id = e.expense_category_id 
  AND DATE_FORMAT(e.date, '%Y-%m') = DATE_FORMAT(b.date, '%Y-%m')
  AND e.expense_status = 'approved'
  `;

  const conditions = [];
  const params = [];

  if (category) {
    conditions.push('b.expense_category_name = ?');
    params.push(category);
  }

  if (month) {
    conditions.push('DATE_FORMAT(b.date, "%Y-%m") = ?');
    params.push(month);
  }

  if (search) {
    conditions.push('(b.expense_category_name LIKE ? OR b.added_by LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' GROUP BY b.budget_id ORDER BY b.date DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  let countQuery = 'SELECT COUNT(*) as total FROM budget b';
  if (conditions.length) {
    countQuery += ' WHERE ' + conditions.join(' AND ');
  }

  connection.query(query, params, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'budget',
        description: 'Failed to fetch budgets',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch budgets', details: err.message });
    }

    connection.query(countQuery, params.slice(0, -2), (countErr, countResult) => {
      if (countErr) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'budget',
          description: 'Failed to count budgets',
          performedById: req.session?.userId || 'unknown',
          performedByRole: req.session?.userRole || 'unknown',
          req,
          significance: 'high',
          metadata: { error: countErr.message }
        });
        return res.status(500).json({ error: 'Failed to count budgets', details: countErr.message });
      }

      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);

      logActivity({
        activityType: 'FETCH_ALL_SUCCESS',
        tableName: 'budget',
        description: 'Successfully fetched budgets with filters',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: { count: results.length, filters: req.query }
      });

      res.status(200).json({
        data: results,
        pagination: {
          total,
          totalPages,
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    });
  });
});

app.get('/budget/months', (req, res) => {
  const query = `
    SELECT DISTINCT DATE_FORMAT(date, '%Y-%m') as month 
    FROM budget 
    ORDER BY month DESC
  `;
  
  connection.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch months' });
    }
    res.json(results.map(r => r.month));
  });
});


app.get('/budget/:expense_category_id', (req, res) => {
  const { expense_category_id } = req.params;
  const query = 'SELECT * FROM budget WHERE expense_category_id = ? ORDER BY date DESC';

  logActivity({
    activityType: 'FETCH_BUDGET_BY_CATEGORY',
    tableName: 'budget',
    recordId: expense_category_id,
    description: `Fetching budget for category ID ${expense_category_id}`,
    performedById: req.session?.userId || 'unknown',
    performedByRole: req.session?.userRole || 'unknown',
    req,
    significance: 'medium',
    metadata: { expense_category_id }
  });

  connection.query(query, [expense_category_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'budget',
        recordId: expense_category_id,
        description: 'Failed to fetch budget by category ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch budget', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'budget',
        recordId: expense_category_id,
        description: 'Budget not found for category ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Budget not found for this category' });
    }
    logActivity({
      activityType: 'FETCH_BUDGET_SUCCESS',
      tableName: 'budget',
      recordId: expense_category_id,
      description: `Successfully fetched budget for category ID ${expense_category_id}`,
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});


app.get('/budget/:budget_id', (req, res) => {
  const { budget_id } = req.params;
  const query = 'SELECT * FROM budget WHERE budget_id = ?';
  connection.query(query, [budget_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'budget',
        recordId: budget_id,
        description: 'Failed to fetch budget by ID',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch budget', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'budget',
        recordId: budget_id,
        description: 'Budget not found',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Budget not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE_SUCCESS',
      tableName: 'budget',
      recordId: budget_id,
      description: 'Fetched budget by ID',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});



app.patch('/budget/:budget_id', (req, res) => {
  const { budget_id } = req.params;
  const {
    expense_category_id,
    expense_category_name,
    month,
    date,
    amount
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (expense_category_id) { updateFields.push('expense_category_id = ?'); updateValues.push(expense_category_id); }
  if (expense_category_name) { updateFields.push('expense_category_name = ?'); updateValues.push(expense_category_name); }
  if (month) { updateFields.push('month = ?'); updateValues.push(month); }
  if (date) { updateFields.push('date = ?'); updateValues.push(date); }
  if (amount !== undefined) { updateFields.push('amount = ?'); updateValues.push(amount); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE budget SET ${updateFields.join(', ')} WHERE budget_id = ?`;
  updateValues.push(budget_id);

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'budget',
        recordId: budget_id,
        description: 'Failed to update budget',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update budget', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'budget',
        recordId: budget_id,
        description: 'Budget not found for update',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Budget not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'budget',
      recordId: budget_id,
      description: 'Updated budget',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: { budget_id }
    });
    res.status(200).json({ message: 'Budget updated', budget_id });
  });
});


app.delete('/budget/:budget_id', (req, res) => {
  const { budget_id } = req.params;
  const query = 'DELETE FROM budget WHERE budget_id = ?';
  connection.query(query, [budget_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'budget',
        recordId: budget_id,
        description: 'Failed to delete budget',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete budget', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'budget',
        recordId: budget_id,
        description: 'Budget not found for deletion',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Budget not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'budget',
      recordId: budget_id,
      description: 'Deleted budget',
      performedById: req.session?.userId || 'unknown',
      performedByRole: req.session?.userRole || 'unknown',
      req,
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Budget deleted', budget_id });
  });
});

app.get('/budget_summary', async (req, res) => {
  const { expense_category_id, period, custom_start, custom_end } = req.query;
  let where = '1=1';
  let params = [];


  if (expense_category_id) {
    where += ' AND expense_category_id = ?';
    params.push(expense_category_id);
  }

 
  let dateWhere = '';
  switch (period) {
    case 'today':
      dateWhere = "AND DATE(date) = CURDATE()";
      break;
    case 'yesterday':
      dateWhere = "AND DATE(date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
      break;
    case 'last7days':
      dateWhere = "AND DATE(date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
      break;
    case 'month':
      dateWhere = "AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())";
      break;
    case 'year':
      dateWhere = "AND YEAR(date) = YEAR(CURDATE())";
      break;
    case 'custom':
      if (custom_start && custom_end) {
        dateWhere = "AND DATE(date) BETWEEN ? AND ?";
        params.push(custom_start, custom_end);
      }
      break;
  }

  try {
   
    const [budgetRows] = await connection.promise().query(
      `SELECT COALESCE(SUM(amount),0) AS total_budget
       FROM budget WHERE ${where} ${dateWhere}`, params
    );
    
    const [spentRows] = await connection.promise().query(
      `SELECT COALESCE(SUM(amount),0) AS total_spent
       FROM expense
       WHERE expense_status = 'approved'
         ${expense_category_id ? 'AND expense_category_id = ?' : ''}
         ${dateWhere.replace(/date/g, 'date')}`,
      expense_category_id ? [...params, expense_category_id] : params
    );

    const total_budget = Number(budgetRows[0].total_budget) || 0;
    const total_spent = Number(spentRows[0].total_spent) || 0;
    const remaining_budget = total_budget - total_spent;

    res.json({ total_budget, total_spent, remaining_budget });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budget summary', details: err.message });
  }
});

app.get('/budget_vs_spending_graph', async (req, res) => {
  const { expense_category_id, period, custom_start, custom_end } = req.query;
  let groupBy, labelFormat, dateWhere = '', params = [];

  
  switch (period) {
    case 'today':
      groupBy = "HOUR(date)";
      labelFormat = "CONCAT(LPAD(HOUR(date),2,'0'), ':00')";
      dateWhere = "AND DATE(date) = CURDATE()";
      break;
    case 'week':
    case 'last7days':
      groupBy = "DAYNAME(date)";
      labelFormat = "DAYNAME(date)";
      dateWhere = "AND DATE(date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
      break;
    case 'month':
      groupBy = "WEEK(date)";
      labelFormat = "CONCAT('Week ', WEEK(date) - WEEK(DATE_SUB(date, INTERVAL DAY(date)-1 DAY)) + 1)";
      dateWhere = "AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())";
      break;
    case 'year':
      groupBy = "MONTH(date)";
      labelFormat = "MONTHNAME(date)";
      dateWhere = "AND YEAR(date) = YEAR(CURDATE())";
      break;
    case 'custom':
      if (custom_start && custom_end) {
        groupBy = "DATE(date)";
        labelFormat = "DATE(date)";
        dateWhere = "AND DATE(date) BETWEEN ? AND ?";
        params.push(custom_start, custom_end);
      }
      break;
    default:
      groupBy = "DATE(date)";
      labelFormat = "DATE(date)";
      break;
  }

 
  let catFilter = '';
  if (expense_category_id) {
    catFilter = 'AND expense_category_id = ?';
    params.push(expense_category_id);
  }

  try {
  
    const [budgetRows] = await connection.promise().query(
      `SELECT ${labelFormat} AS label, COALESCE(SUM(amount),0) AS budget
       FROM budget
       WHERE 1=1 ${catFilter} ${dateWhere}
       GROUP BY ${groupBy}
       ORDER BY MIN(date) ASC`, params
    );
    
    const [spentRows] = await connection.promise().query(
      `SELECT ${labelFormat} AS label, COALESCE(SUM(amount),0) AS spent
       FROM expense
       WHERE expense_status = 'approved' ${catFilter} ${dateWhere}
       GROUP BY ${groupBy}
       ORDER BY MIN(date) ASC`, params
    );

 
    const result = {};
    budgetRows.forEach(row => result[row.label] = { label: row.label, budget: Number(row.budget), spent: 0 });
    spentRows.forEach(row => {
      if (!result[row.label]) result[row.label] = { label: row.label, budget: 0, spent: 0 };
      result[row.label].spent = Number(row.spent);
    });

    res.json(Object.values(result));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budget vs spending graph', details: err.message });
  }
});

app.get('/budget_doughnut', async (req, res) => {
  const { period, custom_start, custom_end } = req.query;
  let dateWhere = '', params = [];

  switch (period) {
    case 'today':
      dateWhere = "AND DATE(date) = CURDATE()";
      break;
    case 'last7days':
      dateWhere = "AND DATE(date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
      break;
    case 'month':
      dateWhere = "AND MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE())";
      break;
    case 'year':
      dateWhere = "AND YEAR(date) = YEAR(CURDATE())";
      break;
    case 'custom':
      if (custom_start && custom_end) {
        dateWhere = "AND DATE(date) BETWEEN ? AND ?";
        params.push(custom_start, custom_end);
      }
      break;
  }

  try {
    const [rows] = await connection.promise().query(
      `SELECT expense_category_name, COALESCE(SUM(amount),0) AS budget
       FROM budget
       WHERE 1=1 ${dateWhere}
       GROUP BY expense_category_name
       ORDER BY budget DESC`, params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budget doughnut data', details: err.message });
  }
});


function getFinanceDateFilter(period, custom_start, custom_end, tableAlias = '') {
  let where = '';
  let params = [];
  const prefix = tableAlias ? tableAlias + '.' : '';
  switch (period) {
    case 'today':
      where = `AND DATE(${prefix}created_at) = CURDATE()`;
      break;
    case 'yesterday':
      where = `AND DATE(${prefix}created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
      break;
    case 'last7days':
      where = `AND DATE(${prefix}created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`;
      break;
    case 'thismonth':
      where = `AND MONTH(${prefix}created_at) = MONTH(CURDATE()) AND YEAR(${prefix}created_at) = YEAR(CURDATE())`;
      break;
    case 'thisyear':
      where = `AND YEAR(${prefix}created_at) = YEAR(CURDATE())`;
      break;
    case 'custom':
      if (custom_start && custom_end) {
        where = `AND DATE(${prefix}created_at) BETWEEN ? AND ?`;
        params.push(custom_start, custom_end);
      }
      break;
    default:
      where = '';
  }
  return { where, params };
}


function getFinanceDateFilter(period, custom_start, custom_end, tableAlias = '', dateField = 'created_at') {
  let where = '';
  let params = [];
  const prefix = tableAlias ? tableAlias + '.' : '';
  switch (period) {
    case 'today':
      where = `AND DATE(${prefix}${dateField}) = CURDATE()`;
      break;
    case 'yesterday':
      where = `AND DATE(${prefix}${dateField}) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
      break;
    case 'last7days':
      where = `AND DATE(${prefix}${dateField}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`;
      break;
    case 'thismonth':
      where = `AND MONTH(${prefix}${dateField}) = MONTH(CURDATE()) AND YEAR(${prefix}${dateField}) = YEAR(CURDATE())`;
      break;
    case 'thisyear':
      where = `AND YEAR(${prefix}${dateField}) = YEAR(CURDATE())`;
      break;
    case 'custom':
      if (custom_start && custom_end) {
        where = `AND DATE(${prefix}${dateField}) BETWEEN ? AND ?`;
        params.push(custom_start, custom_end);
      }
      break;
    default:
      where = '';
  }
  return { where, params };
}


app.get('/finance-data', async (req, res) => {
  const { period = 'today', custom_start, custom_end } = req.query;
  try {
    const salesFilter = getFinanceDateFilter(period, custom_start, custom_end, 'o', 'created_at');
    const expenseFilter = getFinanceDateFilter(period, custom_start, custom_end, 'e', 'date');
    const staffPayFilter = getFinanceDateFilter(period, custom_start, custom_end, 'e', 'date');
    const budgetFilter = getFinanceDateFilter(period, custom_start, custom_end, 'b', 'date');

    const [fuelCatRows] = await connection.promise().query(
      "SELECT category_id FROM product_category WHERE LOWER(category_name) = 'fuel' LIMIT 1"
    );
    const fuelCategoryId = fuelCatRows[0]?.category_id;


    const [rawSalesRows] = await connection.promise().query(
      `SELECT COALESCE(SUM(od.quantity * od.selling_price),0) AS raw_sales
       FROM order_details od
       JOIN orders o ON od.order_id = o.order_id
       WHERE o.status='order_made' ${salesFilter.where}`,
      salesFilter.params
    );
    const raw_sales = Number(rawSalesRows[0].raw_sales) || 0;


    const [discountRows] = await connection.promise().query(
      `SELECT COALESCE(SUM(discount),0) AS total_discount
       FROM orders o WHERE o.status='order_made' ${salesFilter.where}`,
      salesFilter.params
    );
    const total_discount = Number(discountRows[0].total_discount) || 0;


    const total_sales = raw_sales - total_discount;

    let total_fuel_sales = 0;
    if (fuelCategoryId) {
      const [fuelSalesRows] = await connection.promise().query(
        `SELECT COALESCE(SUM(od.quantity * od.selling_price),0) AS total_fuel_sales
         FROM order_details od
         JOIN orders o ON od.order_id = o.order_id
         JOIN product_variations pv ON od.variations_id = pv.variations_id
         JOIN product p ON pv.product_id = p.product_id
         WHERE p.category_id = ? AND o.status='order_made' ${salesFilter.where}`,
        [fuelCategoryId, ...salesFilter.params]
      );
      total_fuel_sales = Number(fuelSalesRows[0].total_fuel_sales) || 0;
    }

    let total_non_fuel_sales = 0;
    if (fuelCategoryId) {
      const [nonFuelSalesRows] = await connection.promise().query(
        `SELECT COALESCE(SUM(od.quantity * od.selling_price),0) AS total_non_fuel_sales
         FROM order_details od
         JOIN orders o ON od.order_id = o.order_id
         JOIN product_variations pv ON od.variations_id = pv.variations_id
         JOIN product p ON pv.product_id = p.product_id
         WHERE p.category_id != ? AND o.status='order_made' ${salesFilter.where}`,
        [fuelCategoryId, ...salesFilter.params]
      );
      total_non_fuel_sales = Number(nonFuelSalesRows[0].total_non_fuel_sales) || 0;
    }

    const [cogsRows] = await connection.promise().query(
      `SELECT COALESCE(SUM(od.quantity * od.cost_price),0) AS total_cogs
       FROM order_details od
       JOIN orders o ON od.order_id = o.order_id
       WHERE o.status='order_made' ${salesFilter.where}`,
      salesFilter.params
    );
    const total_cogs = Number(cogsRows[0].total_cogs) || 0;

    const [expenseRows] = await connection.promise().query(
      `SELECT COALESCE(SUM(amount),0) AS total_expenses
       FROM expense e WHERE e.expense_category_name != 'salary' AND e.expense_status='approved' ${expenseFilter.where}`,
      expenseFilter.params
    );
    const total_expenses = Number(expenseRows[0].total_expenses) || 0;

    const [staffPayRows] = await connection.promise().query(
      `SELECT COALESCE(SUM(amount),0) AS total_staff_payment
       FROM expense e WHERE e.expense_category_name = 'salary' AND e.expense_status='approved' ${staffPayFilter.where}`,
      staffPayFilter.params
    );
    const total_staff_payment = Number(staffPayRows[0].total_staff_payment) || 0;

    const [budgetRows] = await connection.promise().query(
      `SELECT COALESCE(SUM(amount),0) AS total_budget
       FROM budget b WHERE 1=1 ${budgetFilter.where}`,
      budgetFilter.params
    );
    const total_budget = Number(budgetRows[0].total_budget) || 0;
    const budget_usage_percentage = total_budget > 0 ? ((total_expenses + total_staff_payment) / total_budget) * 100 : 0;

    const [taxRows] = await connection.promise().query(
      `SELECT COALESCE(SUM(tax),0) AS total_tax
       FROM orders o WHERE o.status='order_made' ${salesFilter.where}`,
      salesFilter.params
    );
    const total_tax = Number(taxRows[0].total_tax) || 0;

    const gross_profit = total_sales - total_cogs;
    const net_profit = gross_profit - total_expenses - total_staff_payment - total_tax;

    res.json({
      raw_sales,
      total_discount,
      total_sales,
      total_fuel_sales,
      total_non_fuel_sales,
      total_cogs,
      total_expenses,
      total_staff_payment,
      budget_usage_percentage: Number(budget_usage_percentage.toFixed(2)),
      gross_profit,
      net_profit,
      total_tax
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch finance data', details: err.message });
  }
});


app.get('/finance-graph-expense-vs-income', async (req, res) => {
  const { period = 'today', custom_start, custom_end } = req.query;
  try {
    let groupBy, labelExpr, salesFilter, expenseFilter;
    switch (period) {
  case 'today':
    groupBy = 'HOUR(o.created_at)';
    labelExpr = "CONCAT(LPAD(HOUR(o.created_at),2,'0'), ':00')";
    salesFilter = getFinanceDateFilter('today', null, null, 'o', 'created_at');
    expenseFilter = getFinanceDateFilter('today', null, null, 'e', 'date');
    break;
      case 'last7days':
        groupBy = 'DATE(o.created_at)';
        labelExpr = 'DATE(o.created_at)';
        salesFilter = getFinanceDateFilter('last7days', null, null, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('last7days', null, null, 'e', 'date');
        break;
      case 'thismonth':
        groupBy = 'DATE(o.created_at)';
        labelExpr = 'DATE(o.created_at)';
        salesFilter = getFinanceDateFilter('thismonth', null, null, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('thismonth', null, null, 'e', 'date');
        break;
      case 'thisyear':
        groupBy = 'MONTH(o.created_at)';
        labelExpr = 'MONTHNAME(o.created_at)';
        salesFilter = getFinanceDateFilter('thisyear', null, null, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('thisyear', null, null, 'e', 'date');
        break;
      case 'custom':
        groupBy = 'DATE(o.created_at)';
        labelExpr = 'DATE(o.created_at)';
        salesFilter = getFinanceDateFilter('custom', custom_start, custom_end, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('custom', custom_start, custom_end, 'e', 'date');
        break;
      default:
        groupBy = 'DATE(o.created_at)';
        labelExpr = 'DATE(o.created_at)';
        salesFilter = getFinanceDateFilter('today', null, null, 'o',  'created_at');
        expenseFilter = getFinanceDateFilter('today', null, null, 'e', 'date');
    }

    const [salesRows] = await connection.promise().query(
      `SELECT ${labelExpr} AS label, COALESCE(SUM(total_order_amount),0) AS sales
       FROM orders o
       WHERE o.status='order_made' ${salesFilter.where}
       GROUP BY ${groupBy}
       ORDER BY MIN(o.created_at) ASC`,
      salesFilter.params
    );

    const [expenseRows] = await connection.promise().query(
      `SELECT ${labelExpr.replace(/o\.created_at/g, 'e.date')} AS label, COALESCE(SUM(amount),0) AS expenses
       FROM expense e
       WHERE e.expense_status='approved' ${expenseFilter.where}
       GROUP BY ${groupBy.replace(/o\.created_at/g, 'e.date')}
       ORDER BY MIN(e.date) ASC`,
      expenseFilter.params
    );

    const result = {};
    salesRows.forEach(row => result[row.label] = { label: row.label, sales: Number(row.sales), expenses: 0 });
    expenseRows.forEach(row => {
      if (!result[row.label]) result[row.label] = { label: row.label, sales: 0, expenses: 0 };
      result[row.label].expenses = Number(row.expenses);
    });

    res.json(Object.values(result));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch finance graph data', details: err.message });
  }
});


app.get('/finance-graph-profit', async (req, res) => {
  const { period = 'today', custom_start, custom_end } = req.query;
  try {
    let groupBy, labelExpr, salesFilter, expenseFilter;
    switch (period) {
      case 'today':
        groupBy = 'HOUR(o.created_at)';
        labelExpr = "CONCAT(LPAD(HOUR(o.created_at),2,'0'), ':00')";
        salesFilter = getFinanceDateFilter('today', null, null, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('today', null, null, 'e', 'date');
        break;
      case 'last7days':
        groupBy = 'DATE(o.created_at)';
        labelExpr = 'DATE(o.created_at)';
        salesFilter = getFinanceDateFilter('last7days', null, null, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('last7days', null, null, 'e', 'date');
        break;
      case 'thismonth':
        groupBy = 'DATE(o.created_at)';
        labelExpr = 'DATE(o.created_at)';
        salesFilter = getFinanceDateFilter('thismonth', null, null, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('thismonth', null, null, 'e', 'date');
        break;
      case 'thisyear':
        groupBy = 'MONTH(o.created_at)';
        labelExpr = 'MONTHNAME(o.created_at)';
        salesFilter = getFinanceDateFilter('thisyear', null, null, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('thisyear', null, null, 'e', 'date');
        break;
      case 'custom':
        groupBy = 'DATE(o.created_at)';
        labelExpr = 'DATE(o.created_at)';
        salesFilter = getFinanceDateFilter('custom', custom_start, custom_end, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('custom', custom_start, custom_end, 'e', 'date');
        break;
      default:
        groupBy = 'DATE(o.created_at)';
        labelExpr = 'DATE(o.created_at)';
        salesFilter = getFinanceDateFilter('today', null, null, 'o', 'created_at');
        expenseFilter = getFinanceDateFilter('today', null, null, 'e', 'date');
    }

    // Raw sales (quantity * selling_price)
    const [rawSalesRows] = await connection.promise().query(
      `SELECT ${labelExpr} AS label,
              COALESCE(SUM(od.quantity * od.selling_price),0) AS raw_sales
       FROM order_details od
       JOIN orders o ON od.order_id = o.order_id
       WHERE o.status='order_made' ${salesFilter.where}
       GROUP BY ${groupBy}
       ORDER BY MIN(o.created_at) ASC`,
      salesFilter.params
    );

    // COGS
    const [cogsRows] = await connection.promise().query(
      `SELECT ${labelExpr} AS label,
              COALESCE(SUM(od.quantity * od.cost_price),0) AS cogs
       FROM order_details od
       JOIN orders o ON od.order_id = o.order_id
       WHERE o.status='order_made' ${salesFilter.where}
       GROUP BY ${groupBy}
       ORDER BY MIN(o.created_at) ASC`,
      salesFilter.params
    );

    // Discount and Tax
    const [discountTaxRows] = await connection.promise().query(
      `SELECT ${labelExpr} AS label,
              COALESCE(SUM(discount),0) AS discount,
              COALESCE(SUM(tax),0) AS tax
       FROM orders o
       WHERE o.status='order_made' ${salesFilter.where}
       GROUP BY ${groupBy}
       ORDER BY MIN(o.created_at) ASC`,
      salesFilter.params
    );

    // Expenses (excluding salary) and Staff Payment
    const expenseGroupBy = groupBy.replace(/o\.created_at/g, 'e.date');
    const expenseLabelExpr = labelExpr.replace(/o\.created_at/g, 'e.date');
    const [expenseRows] = await connection.promise().query(
      `SELECT ${expenseLabelExpr} AS label,
              COALESCE(SUM(CASE WHEN e.expense_category_name != 'salary' THEN amount ELSE 0 END),0) AS expenses,
              COALESCE(SUM(CASE WHEN e.expense_category_name = 'salary' THEN amount ELSE 0 END),0) AS staff_payment
       FROM expense e
       WHERE e.expense_status='approved' ${expenseFilter.where}
       GROUP BY ${expenseGroupBy}
       ORDER BY MIN(e.date) ASC`,
      expenseFilter.params
    );

    // Merge all results by label
    const result = {};
    rawSalesRows.forEach(row => result[row.label] = {
      label: row.label,
      raw_sales: Number(row.raw_sales),
      cogs: 0,
      discount: 0,
      tax: 0,
      expenses: 0,
      staff_payment: 0
    });
    cogsRows.forEach(row => {
      if (!result[row.label]) result[row.label] = { label: row.label, raw_sales: 0, cogs: 0, discount: 0, tax: 0, expenses: 0, staff_payment: 0 };
      result[row.label].cogs = Number(row.cogs);
    });
    discountTaxRows.forEach(row => {
      if (!result[row.label]) result[row.label] = { label: row.label, raw_sales: 0, cogs: 0, discount: 0, tax: 0, expenses: 0, staff_payment: 0 };
      result[row.label].discount = Number(row.discount);
      result[row.label].tax = Number(row.tax);
    });
    expenseRows.forEach(row => {
      if (!result[row.label]) result[row.label] = { label: row.label, raw_sales: 0, cogs: 0, discount: 0, tax: 0, expenses: 0, staff_payment: 0 };
      result[row.label].expenses = Number(row.expenses);
      result[row.label].staff_payment = Number(row.staff_payment);
    });

    // Calculate gross and net profit
    Object.values(result).forEach(row => {
      row.gross_profit = row.raw_sales - row.cogs;
      row.net_profit = row.gross_profit - row.discount - row.tax - row.expenses - row.staff_payment;
    });

    res.json(Object.values(result));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profit graph data', details: err.message });
  }
});

app.post('/tax', async (req, res) => {
    const { product_id, tax_name, tax_rate, tax_type } = req.body;
  if (!product_id || !tax_name || tax_rate === undefined || !tax_type) {
    return res.status(400).json({ error: 'product_id, tax_rate, and tax_type are required' });
  }
  if (!['inclusive', 'exclusive'].includes(tax_type)) {
    return res.status(400).json({ error: 'tax_type must be inclusive or exclusive' });
  }
  if (isNaN(tax_rate) || tax_rate < 0 || tax_rate > 100) {
    return res.status(400).json({ error: 'tax_rate must be a number between 0 and 100' });
  }
  const tax_id = generateId();
  const query = `INSERT INTO tax (tax_id, product_id, tax_name, tax_rate, tax_type) VALUES (?, ?, ?, ?, ?)`;
  connection.query(query, [tax_id, product_id, tax_name, tax_rate, tax_type], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to assign tax', details: err.message });
    res.status(201).json({ message: 'Tax assigned to product', tax_id });
  });
});

app.get('/tax', async (req, res) => {
  const [rows] = await connection.promise().query('SELECT * FROM tax');
  res.json(rows);
});


app.get('/product_tax/:tax_id/sales', async (req, res) => {
  const { tax_id } = req.params;
  const [taxRows] = await connection.promise().query(
    `SELECT t.*, p.product_name FROM tax t
     JOIN product p ON t.product_id = p.product_id
     WHERE t.tax_id = ?`, [tax_id]
  );
  if (!taxRows.length) return res.status(404).json({ error: 'Tax not found' });
  const { product_id, tax_rate, tax_type, tax_name, product_name } = taxRows[0];

 
  const [variationRows] = await connection.promise().query(
    `SELECT variations_id FROM product_variations WHERE product_id = ?`, [product_id]
  );
  const variationIds = variationRows.map(v => v.variations_id);
  if (!variationIds.length) return res.json({
    tax_id, tax_name, product_name, product_id, tax_rate, tax_type,
    total_sales: 0, total_items: 0, total_tax_collected: 0, customers: []
  });


  const [salesRows] = await connection.promise().query(
    `SELECT 
        o.order_id,
        o.customer_id,
        o.customer_fullname,
        od.quantity,
        od.selling_price,
        (od.quantity * od.selling_price) AS line_total
     FROM order_details od
     JOIN orders o ON od.order_id = o.order_id
     WHERE od.variations_id IN (?) AND o.status = 'order_made'`,
    [variationIds]
  );

  let total_sales = 0, total_items = 0, total_tax_collected = 0;
  salesRows.forEach(row => {
    total_sales += Number(row.line_total);
    total_items += Number(row.quantity);
    if (tax_type === 'exclusive') {
      total_tax_collected += (Number(row.line_total) * tax_rate) / 100;
    } else {
      total_tax_collected += Number(row.line_total) - (Number(row.line_total) / (1 + tax_rate / 100));
    }
  });

  res.json({
    tax_id,
    tax_name,
    product_name,
    product_id,
    tax_rate,
    tax_type,
    total_sales,
    total_items,
    total_tax_collected: Number(total_tax_collected.toFixed(2)),
    customers: salesRows.map(r => ({
      customer_id: r.customer_id,
      customer_fullname: r.customer_fullname,
      order_id: r.order_id,
      quantity: r.quantity,
      line_total: r.line_total
    }))
  });
});


app.get('/product_tax/all_sales', async (req, res) => {
  const [rows] = await connection.promise().query(`
    SELECT 
      t.tax_id, t.tax_name, t.tax_rate, t.tax_type, t.product_id,
      p.product_name,
      o.order_id, o.created_at AS order_date,
      o.customer_id, o.customer_fullname,
      od.quantity, od.selling_price,
      (od.quantity * od.selling_price) AS line_total
    FROM tax t
    JOIN product p ON t.product_id = p.product_id
    JOIN order_details od ON (od.product_id = t.product_id OR od.variations_id IN (
      SELECT variations_id FROM product_variations WHERE product_id = t.product_id
    ))
    JOIN orders o ON od.order_id = o.order_id
    WHERE o.status = 'order_made'
    ORDER BY o.created_at DESC
  `);

  const taxMap = {};
  rows.forEach(row => {
    if (!taxMap[row.tax_id]) {
      taxMap[row.tax_id] = {
        tax_id: row.tax_id,
        tax_name: row.tax_name,
        product_name: row.product_name,
        product_id: row.product_id,
        tax_rate: row.tax_rate,
        tax_type: row.tax_type,
        sales: [],
        total_sales: 0,
        total_items: 0,
        total_tax_collected: 0
      };
    }
    let tax_collected = 0;
    if (row.tax_type === 'exclusive') {
      tax_collected = (row.line_total * row.tax_rate) / 100;
    } else {
      tax_collected = row.line_total - (row.line_total / (1 + row.tax_rate / 100));
    }
    taxMap[row.tax_id].sales.push({
      order_id: row.order_id,
      order_date: row.order_date,
      customer_id: row.customer_id,
      customer_fullname: row.customer_fullname,
      quantity: row.quantity,
      line_total: row.line_total,
      tax_collected
    });
    taxMap[row.tax_id].total_sales += Number(row.line_total);
    taxMap[row.tax_id].total_items += Number(row.quantity);
    taxMap[row.tax_id].total_tax_collected += tax_collected;
  });

  res.json(Object.values(taxMap));
});

app.get('/product_tax_data', async (req, res) => {
  const { period } = req.query;
  let dateFilter = '';
  let params = [];

  switch ((period || '').toLowerCase()) {
    case 'today':
      dateFilter = "AND DATE(o.created_at) = CURDATE()";
      break;
    case 'yesterday':
      dateFilter = "AND DATE(o.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
      break;
    case 'last7days':
      dateFilter = "AND DATE(o.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
      break;
    case 'weekly':
      dateFilter = "AND YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1)";
      break;
    case 'monthly':
      dateFilter = "AND MONTH(o.created_at) = MONTH(CURDATE()) AND YEAR(o.created_at) = YEAR(CURDATE())";
      break;
    case 'yearly':
      dateFilter = "AND YEAR(o.created_at) = YEAR(CURDATE())";
      break;
    default:
      dateFilter = "";
  }

  try {
    const [taxRows] = await connection.promise().query(`
      SELECT 
        t.tax_id, t.tax_rate, t.tax_type, od.quantity, od.selling_price, 
        (od.quantity * od.selling_price) AS line_total
      FROM tax t
      JOIN product p ON t.product_id = p.product_id
      JOIN product_variations pv ON pv.product_id = t.product_id
      JOIN order_details od ON od.variations_id = pv.variations_id
      JOIN orders o ON od.order_id = o.order_id
      WHERE o.status = 'order_made' ${dateFilter}
    `, params);

    let total_tax_collected = 0;
    let tax_refunds = 0;

    taxRows.forEach(row => {
      let tax = 0;
      if (row.tax_type === 'exclusive') {
        tax = (row.line_total * row.tax_rate) / 100;
      } else {
        tax = row.line_total - (row.line_total / (1 + row.tax_rate / 100));
      }
      if (tax >= 0) {
        total_tax_collected += tax;
      } else {
        tax_refunds += Math.abs(tax);
      }
    });

    const [modeRows] = await connection.promise().query(`
      SELECT tax_rate, tax_type, COUNT(*) as count
      FROM tax
      GROUP BY tax_rate, tax_type
      ORDER BY count DESC
      LIMIT 1
    `);

    let default_tax_rate = 0;
    let default_tax_type = 'NAN';
    if (modeRows.length > 0) {
      default_tax_rate = modeRows[0].tax_rate;
      default_tax_type = modeRows[0].tax_type;
    }

    res.json({
      total_tax_collected: Number(total_tax_collected.toFixed(2)),
      tax_refunds: Number(tax_refunds.toFixed(2)),
      default_tax_rate: Number(default_tax_rate),
      default_tax_type
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product tax data', details: err.message });
  }
});

app.get('/tax_collected_graph', async (req, res) => {
  const { filter = 'today' } = req.query;
  let groupBy = '';
  let selectLabel = '';
  let dateWhere = '';
  let params = [];

  switch (filter) {
    case 'today':
      groupBy = "HOUR(created_at)";
      selectLabel = "CONCAT(LPAD(HOUR(created_at),2,'0'), ':00')";
      dateWhere = "AND DATE(created_at) = CURDATE()";
      break;
    case 'weekly':
      groupBy = "DATE(created_at)";
      selectLabel = "DATE(created_at)";
      dateWhere = "AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";
      break;
    case 'monthly':
      groupBy = "DATE(created_at)";
      selectLabel = "DATE(created_at)";
      dateWhere = "AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())";
      break;
    case 'yearly':
      groupBy = "MONTH(created_at)";
      selectLabel = "MONTHNAME(created_at)";
      dateWhere = "AND YEAR(created_at) = YEAR(CURDATE())";
      break;
    default:
      groupBy = "DATE(created_at)";
      selectLabel = "DATE(created_at)";
      dateWhere = "AND DATE(created_at) = CURDATE()";
  }

  try {
    const [rows] = await connection.promise().query(`
      SELECT 
        ${selectLabel} AS label,
        SUM(tax) AS total_tax_collected
      FROM orders
      WHERE status = 'order_made' ${dateWhere}
      GROUP BY ${groupBy}
      ORDER BY MIN(created_at) ASC
    `, params);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tax collected graph', details: err.message });
  }
});

app.post('/station', (req, res) => {
  const {
    station_name,
    station_license_number,
    station_address,
    station_city,
    station_state,
    station_zip_code,
    station_phone_number,
    station_email_address
  } = req.body;

  if (
    !station_name ||
    !station_license_number ||
    !station_address ||
    !station_city ||
    !station_state ||
    !station_zip_code ||
    !station_phone_number ||
    !station_email_address
  ) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const station_id = generateId();
  const query = `INSERT INTO station_detail (
    station_id, station_name, station_license_number, station_address, station_city, station_state, station_zip_code, station_phone_number, station_email_address
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(
    query,
    [
      station_id,
      station_name,
      station_license_number,
      station_address,
      station_city,
      station_state,
      station_zip_code,
      station_phone_number,
      station_email_address
    ],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'station_detail',
          recordId: station_id,
          description: `Failed to create station: ${station_name}`,
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create station', details: err.message });
      }
      logActivity({
        activityType: 'CREATE',
        tableName: 'station_detail',
        recordId: station_id,
        description: `Created station: ${station_name}`,
        significance: 'medium',
        metadata: { station_id, station_name }
      });
      res.status(201).json({ message: 'Station created', station_id, station_name });
    }
  );
});


app.get('/station', (req, res) => {
  const query = 'SELECT * FROM station_detail ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'station_detail',
        description: 'Failed to fetch stations',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch stations', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL',
      tableName: 'station_detail',
      description: 'Fetched all stations',
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});


app.get('/station/:station_id', (req, res) => {
  const { station_id } = req.params;
  const query = 'SELECT * FROM station_detail WHERE station_id = ?';
  connection.query(query, [station_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'station_detail',
        recordId: station_id,
        description: 'Failed to fetch station by ID',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch station', details: err.message });
    }
    if (results.length === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'station_detail',
        recordId: station_id,
        description: 'Station not found',
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Station not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE',
      tableName: 'station_detail',
      recordId: station_id,
      description: 'Fetched station by ID',
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});


app.patch('/station/:station_id', (req, res) => {
  const { station_id } = req.params;
  const {
    station_name,
    station_license_number,
    station_address,
    station_city,
    station_state,
    station_zip_code,
    station_phone_number,
    station_email_address
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (station_name) { updateFields.push('station_name = ?'); updateValues.push(station_name); }
  if (station_license_number) { updateFields.push('station_license_number = ?'); updateValues.push(station_license_number); }
  if (station_address) { updateFields.push('station_address = ?'); updateValues.push(station_address); }
  if (station_city) { updateFields.push('station_city = ?'); updateValues.push(station_city); }
  if (station_state) { updateFields.push('station_state = ?'); updateValues.push(station_state); }
  if (station_zip_code) { updateFields.push('station_zip_code = ?'); updateValues.push(station_zip_code); }
  if (station_phone_number) { updateFields.push('station_phone_number = ?'); updateValues.push(station_phone_number); }
  if (station_email_address) { updateFields.push('station_email_address = ?'); updateValues.push(station_email_address); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE station_detail SET ${updateFields.join(', ')} WHERE station_id = ?`;
  updateValues.push(station_id);

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'station_detail',
        recordId: station_id,
        description: 'Failed to update station',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update station', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'station_detail',
        recordId: station_id,
        description: 'Station not found for update',
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Station not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'station_detail',
      recordId: station_id,
      description: 'Updated station',
      significance: 'medium',
      metadata: { station_id }
    });
    res.status(200).json({ message: 'Station updated', station_id });
  });
});


app.delete('/station/:station_id', (req, res) => {
  const { station_id } = req.params;
  const query = 'DELETE FROM station_detail WHERE station_id = ?';
  connection.query(query, [station_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'station_detail',
        recordId: station_id,
        description: 'Failed to delete station',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete station', details: err.message });
    }
    if (result.affectedRows === 0) {
      logActivity({
        activityType: 'NOT_FOUND',
        tableName: 'station_detail',
        recordId: station_id,
        description: 'Station not found for deletion',
        significance: 'medium',
        metadata: {}
      });
      return res.status(404).json({ error: 'Station not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'station_detail',
      recordId: station_id,
      description: 'Deleted station',
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Station deleted', station_id });
  });
});


app.post('/notification_settings', (req, res) => {
  const {
    admin_id,
    admin_role,
    daily_sales_summary,
    low_inventory_alerts,
    price_change_config,
    staff_schedule_updates,
    critical_alerts,
    maintance_reminder
  } = req.body;

  if (!admin_id || !admin_role) {
    return res.status(400).json({ error: 'admin_id and admin_role are required' });
  }

  const settings_id = generateId();
  const query = `INSERT INTO notification_settings (
    settings_id, admin_id, admin_role, daily_sales_summary, low_inventory_alerts, price_change_config, staff_schedule_updates, critical_alerts, maintance_reminder
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(
    query,
    [
      settings_id,
      admin_id,
      admin_role,
      daily_sales_summary ?? null,
      low_inventory_alerts ?? null,
      price_change_config ?? null,
      staff_schedule_updates ?? null,
      critical_alerts ?? null,
      maintance_reminder ?? null
    ],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'notification_settings',
          recordId: settings_id,
          description: 'Failed to create notification settings',
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create notification settings', details: err.message });
      }
      logActivity({
        activityType: 'CREATE',
        tableName: 'notification_settings',
        recordId: settings_id,
        description: 'Created notification settings',
        significance: 'medium',
        metadata: { settings_id, admin_id }
      });
      res.status(201).json({ message: 'Notification settings created', settings_id });
    }
  );
});


app.get('/notification_settings', (req, res) => {
  const query = 'SELECT * FROM notification_settings ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'notification_settings',
        description: 'Failed to fetch notification settings',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch notification settings', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL',
      tableName: 'notification_settings',
      description: 'Fetched all notification settings',
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});


app.get('/notification_settings/admin/:admin_id', (req, res) => {
  const { admin_id } = req.params;
  const query = 'SELECT * FROM notification_settings WHERE admin_id = ?';
  connection.query(query, [admin_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'notification_settings',
        recordId: admin_id,
        description: 'Failed to fetch notification settings by admin_id',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch notification settings', details: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Notification settings not found for this admin' });
    }
    logActivity({
      activityType: 'FETCH_ONE',
      tableName: 'notification_settings',
      recordId: admin_id,
      description: 'Fetched notification settings by admin_id',
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});


app.get('/notification_settings/:settings_id', (req, res) => {
  const { settings_id } = req.params;
  const query = 'SELECT * FROM notification_settings WHERE settings_id = ?';
  connection.query(query, [settings_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'notification_settings',
        recordId: settings_id,
        description: 'Failed to fetch notification settings by settings_id',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch notification settings', details: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Notification settings not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE',
      tableName: 'notification_settings',
      recordId: settings_id,
      description: 'Fetched notification settings by settings_id',
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});


app.patch('/notification_settings/:settings_id', (req, res) => {
  const { settings_id } = req.params;
  const {
    admin_id,
    admin_role,
    daily_sales_summary,
    low_inventory_alerts,
    price_change_config,
    staff_schedule_updates,
    critical_alerts,
    maintance_reminder
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (admin_id) { updateFields.push('admin_id = ?'); updateValues.push(admin_id); }
  if (admin_role) { updateFields.push('admin_role = ?'); updateValues.push(admin_role); }
  if (daily_sales_summary !== undefined) { updateFields.push('daily_sales_summary = ?'); updateValues.push(daily_sales_summary); }
  if (low_inventory_alerts !== undefined) { updateFields.push('low_inventory_alerts = ?'); updateValues.push(low_inventory_alerts); }
  if (price_change_config !== undefined) { updateFields.push('price_change_config = ?'); updateValues.push(price_change_config); }
  if (staff_schedule_updates !== undefined) { updateFields.push('staff_schedule_updates = ?'); updateValues.push(staff_schedule_updates); }
  if (critical_alerts !== undefined) { updateFields.push('critical_alerts = ?'); updateValues.push(critical_alerts); }
  if (maintance_reminder !== undefined) { updateFields.push('maintance_reminder = ?'); updateValues.push(maintance_reminder); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE notification_settings SET ${updateFields.join(', ')} WHERE settings_id = ?`;
  updateValues.push(settings_id);

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'notification_settings',
        recordId: settings_id,
        description: 'Failed to update notification settings',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update notification settings', details: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification settings not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'notification_settings',
      recordId: settings_id,
      description: 'Updated notification settings',
      significance: 'medium',
      metadata: { settings_id }
    });
    res.status(200).json({ message: 'Notification settings updated', settings_id });
  });
});


app.delete('/notification_settings/:settings_id', (req, res) => {
  const { settings_id } = req.params;
  const query = 'DELETE FROM notification_settings WHERE settings_id = ?';
  connection.query(query, [settings_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'notification_settings',
        recordId: settings_id,
        description: 'Failed to delete notification settings',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete notification settings', details: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification settings not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'notification_settings',
      recordId: settings_id,
      description: 'Deleted notification settings',
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Notification settings deleted', settings_id });
  });
});

app.post('/system_settings', (req, res) => {
  const {
    admin_id,
    admin_role,
    dark_mode,
    date_format,
    time_format,
    base_dark_mode,
    base_date_format,
    base_time_format
  } = req.body;

  if (!admin_id || !admin_role) {
    return res.status(400).json({ error: 'admin_id and admin_role are required' });
  }

  const system_setting_id = generateId();
  const query = `INSERT INTO system_settings (
    system_setting_id, admin_id, admin_role, dark_mode, date_format, time_format, base_dark_mode, base_date_format, base_time_format
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(
    query,
    [
      system_setting_id,
      admin_id,
      admin_role,
      dark_mode ?? null,
      date_format ?? null,
      time_format ?? null,
      base_dark_mode ?? null,
      base_date_format ?? null,
      base_time_format ?? null
    ],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'system_settings',
          recordId: system_setting_id,
          description: 'Failed to create system settings',
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create system settings', details: err.message });
      }
      logActivity({
        activityType: 'CREATE',
        tableName: 'system_settings',
        recordId: system_setting_id,
        description: 'Created system settings',
        significance: 'medium',
        metadata: { system_setting_id, admin_id }
      });
      res.status(201).json({ message: 'System settings created', system_setting_id });
    }
  );
});


app.get('/system_settings/admin/:admin_id', (req, res) => {
  const { admin_id } = req.params;
  const query = 'SELECT * FROM system_settings WHERE admin_id = ?';
  connection.query(query, [admin_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'system_settings',
        recordId: admin_id,
        description: 'Failed to fetch system settings by admin_id',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch system settings', details: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'System settings not found for this admin' });
    }
    logActivity({
      activityType: 'FETCH_ONE',
      tableName: 'system_settings',
      recordId: admin_id,
      description: 'Fetched system settings by admin_id',
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});


app.patch('/system_settings/:system_setting_id', (req, res) => {
  const { system_setting_id } = req.params;
  const {
    admin_id,
    admin_role,
    dark_mode,
    date_format,
    time_format,
    base_dark_mode,
    base_date_format,
    base_time_format
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (admin_id) { updateFields.push('admin_id = ?'); updateValues.push(admin_id); }
  if (admin_role) { updateFields.push('admin_role = ?'); updateValues.push(admin_role); }
  if (dark_mode !== undefined) { updateFields.push('dark_mode = ?'); updateValues.push(dark_mode); }
  if (date_format !== undefined) { updateFields.push('date_format = ?'); updateValues.push(date_format); }
  if (time_format !== undefined) { updateFields.push('time_format = ?'); updateValues.push(time_format); }
  if (base_dark_mode !== undefined) { updateFields.push('base_dark_mode = ?'); updateValues.push(base_dark_mode); }
  if (base_date_format !== undefined) { updateFields.push('base_date_format = ?'); updateValues.push(base_date_format); }
  if (base_time_format !== undefined) { updateFields.push('base_time_format = ?'); updateValues.push(base_time_format); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE system_settings SET ${updateFields.join(', ')} WHERE system_setting_id = ?`;
  updateValues.push(system_setting_id);

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'system_settings',
        recordId: system_setting_id,
        description: 'Failed to update system settings',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update system settings', details: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'System settings not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'system_settings',
      recordId: system_setting_id,
      description: 'Updated system settings',
      significance: 'medium',
      metadata: { system_setting_id }
    });
    res.status(200).json({ message: 'System settings updated', system_setting_id });
  });
});


app.delete('/system_settings/:system_setting_id', (req, res) => {
  const { system_setting_id } = req.params;
  const query = 'DELETE FROM system_settings WHERE system_setting_id = ?';
  connection.query(query, [system_setting_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'system_settings',
        recordId: system_setting_id,
        description: 'Failed to delete system settings',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete system settings', details: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'System settings not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'system_settings',
      recordId: system_setting_id,
      description: 'Deleted system settings',
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'System settings deleted', system_setting_id });
  });
});


app.post('/fuel_setup', (req, res) => {
  const {
    admin_id,
    admin_role,
    fuel_category,
    cost_price,
    selling_price,
    tank_capacity,
    pumps_number
  } = req.body;

  if (
    !admin_id ||
    !admin_role ||
    !fuel_category ||
    cost_price === undefined ||
    selling_price === undefined ||
    tank_capacity === undefined ||
    pumps_number === undefined
  ) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const fuel_type_id = generateId();
  const query = `INSERT INTO fuel_setup (
    fuel_type_id, admin_id, admin_role, fuel_category, cost_price, selling_price, tank_capacity, pumps_number
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(
    query,
    [
      fuel_type_id,
      admin_id,
      admin_role,
      fuel_category,
      cost_price,
      selling_price,
      tank_capacity,
      pumps_number
    ],
    (err, result) => {
      if (err) {
        logActivity({
          activityType: 'DB_ERROR',
          tableName: 'fuel_setup',
          recordId: fuel_type_id,
          description: 'Failed to create fuel setup',
          significance: 'high',
          metadata: { error: err.message }
        });
        return res.status(500).json({ error: 'Failed to create fuel setup', details: err.message });
      }
      logActivity({
        activityType: 'CREATE',
        tableName: 'fuel_setup',
        recordId: fuel_type_id,
        description: 'Created fuel setup',
        significance: 'medium',
        metadata: { fuel_type_id, admin_id }
      });
      res.status(201).json({ message: 'Fuel setup created', fuel_type_id });
    }
  );
});


app.get('/fuel_setup', (req, res) => {
  const query = 'SELECT * FROM fuel_setup ORDER BY created_at DESC';
  connection.query(query, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'fuel_setup',
        description: 'Failed to fetch fuel setups',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch fuel setups', details: err.message });
    }
    logActivity({
      activityType: 'FETCH_ALL',
      tableName: 'fuel_setup',
      description: 'Fetched all fuel setups',
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});


app.get('/fuel_setup/:fuel_type_id', (req, res) => {
  const { fuel_type_id } = req.params;
  const query = 'SELECT * FROM fuel_setup WHERE fuel_type_id = ?';
  connection.query(query, [fuel_type_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'fuel_setup',
        recordId: fuel_type_id,
        description: 'Failed to fetch fuel setup by ID',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch fuel setup', details: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Fuel setup not found' });
    }
    logActivity({
      activityType: 'FETCH_ONE',
      tableName: 'fuel_setup',
      recordId: fuel_type_id,
      description: 'Fetched fuel setup by ID',
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json(results[0]);
  });
});


app.get('/fuel_setup/admin/:admin_id', (req, res) => {
  const { admin_id } = req.params;
  const query = 'SELECT * FROM fuel_setup WHERE admin_id = ? ORDER BY created_at DESC';
  connection.query(query, [admin_id], (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'fuel_setup',
        recordId: admin_id,
        description: 'Failed to fetch fuel setups by admin_id',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch fuel setups', details: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'No fuel setups found for this admin' });
    }
    logActivity({
      activityType: 'FETCH_ALL',
      tableName: 'fuel_setup',
      recordId: admin_id,
      description: 'Fetched fuel setups by admin_id',
      significance: 'medium',
      metadata: { count: results.length }
    });
    res.status(200).json(results);
  });
});


app.patch('/fuel_setup/:fuel_type_id', (req, res) => {
  const { fuel_type_id } = req.params;
  const {
    admin_id,
    admin_role,
    fuel_category,
    cost_price,
    selling_price,
    tank_capacity,
    pumps_number
  } = req.body;

  const updateFields = [];
  const updateValues = [];

  if (admin_id) { updateFields.push('admin_id = ?'); updateValues.push(admin_id); }
  if (admin_role) { updateFields.push('admin_role = ?'); updateValues.push(admin_role); }
  if (fuel_category) { updateFields.push('fuel_category = ?'); updateValues.push(fuel_category); }
  if (cost_price !== undefined) { updateFields.push('cost_price = ?'); updateValues.push(cost_price); }
  if (selling_price !== undefined) { updateFields.push('selling_price = ?'); updateValues.push(selling_price); }
  if (tank_capacity !== undefined) { updateFields.push('tank_capacity = ?'); updateValues.push(tank_capacity); }
  if (pumps_number !== undefined) { updateFields.push('pumps_number = ?'); updateValues.push(pumps_number); }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  const query = `UPDATE fuel_setup SET ${updateFields.join(', ')} WHERE fuel_type_id = ?`;
  updateValues.push(fuel_type_id);

  connection.query(query, updateValues, (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'fuel_setup',
        recordId: fuel_type_id,
        description: 'Failed to update fuel setup',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to update fuel setup', details: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Fuel setup not found' });
    }
    logActivity({
      activityType: 'UPDATE_SUCCESS',
      tableName: 'fuel_setup',
      recordId: fuel_type_id,
      description: 'Updated fuel setup',
      significance: 'medium',
      metadata: { fuel_type_id }
    });
    res.status(200).json({ message: 'Fuel setup updated', fuel_type_id });
  });
});


app.delete('/fuel_setup/:fuel_type_id', (req, res) => {
  const { fuel_type_id } = req.params;
  const query = 'DELETE FROM fuel_setup WHERE fuel_type_id = ?';
  connection.query(query, [fuel_type_id], (err, result) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'fuel_setup',
        recordId: fuel_type_id,
        description: 'Failed to delete fuel setup',
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to delete fuel setup', details: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Fuel setup not found' });
    }
    logActivity({
      activityType: 'DELETE_SUCCESS',
      tableName: 'fuel_setup',
      recordId: fuel_type_id,
      description: 'Deleted fuel setup',
      significance: 'medium',
      metadata: {}
    });
    res.status(200).json({ message: 'Fuel setup deleted', fuel_type_id });
  });
});

app.get('/sales_expense_data', (req, res) => {
  const { period, custom_start, custom_end } = req.query;

  const validPeriods = ['day', 'week', 'month', 'year', 'custom', 'last7days'];
  if (!period || !validPeriods.includes(period)) {
    return res.status(400).json({ error: 'Invalid period parameter. Must be day, week, month, year, last7days, or custom' });
  }

  if (period === 'custom' && (!custom_start || !custom_end)) {
    return res.status(400).json({ error: 'For custom period, both custom_start and custom_end parameters are required' });
  }

  try {
    let cogsWhereClause = "o.status = 'order_made'";
    let expenseWhereClause = "expense_status = 'approved' AND expense_category_name != 'salary'";
    let staffPayWhereClause = "expense_status = 'approved' AND expense_category_name = 'salary'";
    let taxWhereClause = "status = 'order_made'";
    let params = [];
    let expenseParams = [];
    let staffPayParams = [];
    let taxParams = [];

    const now = new Date();
    const formatDate = (date) => date.toISOString().split('T')[0];

    switch (period) {
      case 'day': {
        const today = formatDate(now);
        cogsWhereClause += " AND DATE(o.created_at) = ?";
        expenseWhereClause += " AND DATE(date) = ?";
        staffPayWhereClause += " AND DATE(date) = ?";
        taxWhereClause += " AND DATE(created_at) = ?";
        params = [today];
        expenseParams = [today];
        staffPayParams = [today];
        taxParams = [today];
        break;
      }
      case 'last7days': {
        const today = formatDate(now);
        const sevenDaysAgo = formatDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
        cogsWhereClause += " AND DATE(o.created_at) BETWEEN ? AND ?";
        expenseWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        staffPayWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        taxWhereClause += " AND DATE(created_at) BETWEEN ? AND ?";
        params = [sevenDaysAgo, today];
        expenseParams = [sevenDaysAgo, today];
        staffPayParams = [sevenDaysAgo, today];
        taxParams = [sevenDaysAgo, today];
        break;
      }
      case 'week': {
        const weekStart = formatDate(new Date(now.setDate(now.getDate() - now.getDay())));
        const weekEnd = formatDate(new Date(now.setDate(now.getDate() - now.getDay() + 6)));
        cogsWhereClause += " AND DATE(o.created_at) BETWEEN ? AND ?";
        expenseWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        staffPayWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        taxWhereClause += " AND DATE(created_at) BETWEEN ? AND ?";
        params = [weekStart, weekEnd];
        expenseParams = [weekStart, weekEnd];
        staffPayParams = [weekStart, weekEnd];
        taxParams = [weekStart, weekEnd];
        break;
      }
      case 'month': {
        const monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const monthEnd = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        cogsWhereClause += " AND DATE(o.created_at) BETWEEN ? AND ?";
        expenseWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        staffPayWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        taxWhereClause += " AND DATE(created_at) BETWEEN ? AND ?";
        params = [monthStart, monthEnd];
        expenseParams = [monthStart, monthEnd];
        staffPayParams = [monthStart, monthEnd];
        taxParams = [monthStart, monthEnd];
        break;
      }
      case 'year': {
        const yearStart = formatDate(new Date(now.getFullYear(), 0, 1));
        const yearEnd = formatDate(new Date(now.getFullYear(), 11, 31));
        cogsWhereClause += " AND DATE(o.created_at) BETWEEN ? AND ?";
        expenseWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        staffPayWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        taxWhereClause += " AND DATE(created_at) BETWEEN ? AND ?";
        params = [yearStart, yearEnd];
        expenseParams = [yearStart, yearEnd];
        staffPayParams = [yearStart, yearEnd];
        taxParams = [yearStart, yearEnd];
        break;
      }
      case 'custom': {
        cogsWhereClause += " AND DATE(o.created_at) BETWEEN ? AND ?";
        expenseWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        staffPayWhereClause += " AND DATE(date) BETWEEN ? AND ?";
        taxWhereClause += " AND DATE(created_at) BETWEEN ? AND ?";
        params = [custom_start, custom_end];
        expenseParams = [custom_start, custom_end];
        staffPayParams = [custom_start, custom_end];
        taxParams = [custom_start, custom_end];
        break;
      }
    }

    Promise.all([
      // Raw sales (sum of quantity * selling_price)
      new Promise((resolve, reject) => {
        const rawSalesQuery = `
          SELECT SUM(od.quantity * od.selling_price) as raw_sales
          FROM order_details od
          JOIN orders o ON od.order_id = o.order_id
          WHERE ${cogsWhereClause}
        `;
        connection.query(rawSalesQuery, params, (err, result) => {
          if (err) return reject(err);
          resolve(result[0]?.raw_sales || 0);
        });
      }),
      // Total discount
      new Promise((resolve, reject) => {
        const discountQuery = `SELECT SUM(discount) as total_discount FROM orders WHERE status='order_made' AND ${taxWhereClause.replace('status = \'order_made\' AND ', '')}`;
        connection.query(discountQuery, taxParams, (err, result) => {
          if (err) return reject(err);
          resolve(result[0]?.total_discount || 0);
        });
      }),
      // Expenses (excluding salary)
      new Promise((resolve, reject) => {
        const expenseQuery = `SELECT SUM(amount) as total_expenses FROM expense WHERE ${expenseWhereClause}`;
        connection.query(expenseQuery, expenseParams, (err, result) => {
          if (err) return reject(err);
          resolve(result[0]?.total_expenses || 0);
        });
      }),
      // Staff payment (salary)
      new Promise((resolve, reject) => {
        const staffPayQuery = `SELECT SUM(amount) as total_staff_payment FROM expense WHERE ${staffPayWhereClause}`;
        connection.query(staffPayQuery, staffPayParams, (err, result) => {
          if (err) return reject(err);
          resolve(result[0]?.total_staff_payment || 0);
        });
      }),
      // COGS
      new Promise((resolve, reject) => {
        const cogsQuery = `
          SELECT SUM(od.quantity * od.cost_price) as total_cogs
          FROM order_details od
          JOIN orders o ON od.order_id = o.order_id
          WHERE ${cogsWhereClause}
        `;
        connection.query(cogsQuery, params, (err, result) => {
          if (err) return reject(err);
          resolve(result[0]?.total_cogs || 0);
        });
      }),
      // Tax
      new Promise((resolve, reject) => {
        const taxQuery = `SELECT SUM(tax) as total_tax FROM orders WHERE ${taxWhereClause}`;
        connection.query(taxQuery, taxParams, (err, result) => {
          if (err) return reject(err);
          resolve(result[0]?.total_tax || 0);
        });
      })
    ]).then(([raw_sales, total_discount, total_expenses, total_staff_payment, total_cogs, total_tax]) => {
      const total_sales_discount = Number(raw_sales) - Number(total_discount);
       const total_sales = Number(raw_sales) - Number(total_discount);
      const net_profit = total_sales_discount - Number(total_cogs) - Number(total_expenses) - Number(total_staff_payment) - Number(total_tax);

      const response = {
        total_sales,
        total_expenses: Number(total_expenses) + Number(total_staff_payment),
        net_profit
      };

      logActivity({
        activityType: 'REPORT_GENERATE',
        tableName: 'sales_expense_report',
        description: `Generated sales/expense report for period: ${period}`,
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'low',
        metadata: response
      });

      res.status(200).json(response);
    }).catch(err => {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'sales_expense_report',
        description: 'Failed to generate sales/expense report',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      res.status(500).json({ error: 'Failed to generate report', details: err.message });
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.get('/dashboard-stock-deep-dive', async (req, res) => {
  try {
    
    const [fuelCatRows] = await connection.promise().query(
      "SELECT category_id FROM product_category WHERE LOWER(category_name) = 'fuel' LIMIT 1"
    );
    if (!fuelCatRows.length) return res.status(404).json({ error: 'Fuel category not found' });
    const fuelCategoryId = fuelCatRows[0].category_id;

  
    const [nonFuelVariations] = await connection.promise().query(`
      SELECT 
        pv.variations_id,
        pv.product_id,
        pv.product_name,
        pv.current_variations_stock_qty_number,
        pv.stock_qty_alert_level,
        pv.selling_price,
        pv.cost_price,
        pv.opening_stock_qty,
        pv.variation_image,
        pc.category_id,
        pc.category_name
      FROM product_variations pv
      JOIN product p ON pv.product_id = p.product_id
      JOIN product_category pc ON p.category_id = pc.category_id
      WHERE p.category_id != ?
      ORDER BY pv.product_name
    `, [fuelCategoryId]);

    // Variations at alert level (not zero)
    const alertLevelVariations = nonFuelVariations.filter(v =>
      v.current_variations_stock_qty_number <= v.stock_qty_alert_level &&
      v.current_variations_stock_qty_number > 0
    );

 
    const totalNonFuelValue = nonFuelVariations.reduce(
      (sum, v) => sum + (Number(v.current_variations_stock_qty_number) * Number(v.selling_price || 0)), 0
    );

   
    const reorderVariations = nonFuelVariations.filter(v =>
      v.current_variations_stock_qty_number <= v.stock_qty_alert_level
    );

    
    const [lastNonFuelRestock] = await connection.promise().query(`
      SELECT sm.*, pv.product_name, pv.variations_id
      FROM stock_modify sm
      JOIN product_variations pv ON sm.variations_id = pv.variations_id
      JOIN product p ON pv.product_id = p.product_id
      WHERE sm.adjustment_action = 'increase' AND p.category_id != ?
      ORDER BY sm.date DESC
      LIMIT 1
    `, [fuelCategoryId]);

   
    const [fuelVariations] = await connection.promise().query(`
      SELECT 
        pv.variations_id,
        pv.product_id,
        pv.product_name,
        pv.current_variations_stock_qty_number,
        pv.stock_qty_alert_level,
        pv.selling_price,
        pv.cost_price,
        pv.opening_stock_qty,
        pv.variation_image
      FROM product_variations pv
      JOIN product p ON pv.product_id = p.product_id
      WHERE p.category_id = ?
      ORDER BY pv.product_name
    `, [fuelCategoryId]);

  
    const totalFuelQty = fuelVariations.reduce(
      (sum, v) => sum + Number(v.current_variations_stock_qty_number), 0
    );


const [maxCapRows] = await connection.promise().query(`
  SELECT SUM(sm.size) AS total_received
  FROM stock_modify sm
  JOIN product_variations pv ON sm.variations_id = pv.variations_id
  JOIN product p ON pv.product_id = p.product_id
  WHERE p.category_id = ? AND sm.adjustment_action = 'increase'
`, [fuelCategoryId]);

let maxCapacity = 1000;
if (maxCapRows.length > 0 && maxCapRows[0].total_received) {
  maxCapacity = Number(maxCapRows[0].total_received);
}

    
    let fuelStockLevel = 'normal';
    if (totalFuelQty === 0) fuelStockLevel = 'finished';
    else if (fuelVariations.some(v => v.current_variations_stock_qty_number <= v.stock_qty_alert_level && v.current_variations_stock_qty_number > 0)) fuelStockLevel = 'low';

   
    const [lastFuelRestock] = await connection.promise().query(`
      SELECT sm.*, pv.product_name, pv.variations_id
      FROM stock_modify sm
      JOIN product_variations pv ON sm.variations_id = pv.variations_id
      JOIN product p ON pv.product_id = p.product_id
      WHERE sm.adjustment_action = 'increase' AND p.category_id = ?
      ORDER BY sm.date DESC
      LIMIT 1
    `, [fuelCategoryId]);

    res.json({
      non_fuel_stock: {
        variations: nonFuelVariations,
        alert_level_variations: alertLevelVariations,
        total_value: totalNonFuelValue,
        reorder_variations: reorderVariations,
        last_restocked: lastNonFuelRestock[0] || null
      },
      fuel_stock: {
        variations: fuelVariations,
        total_quantity: totalFuelQty,
        stock_level: fuelStockLevel,
        last_restocked: lastFuelRestock[0] || null,
         max_capacity: maxCapacity
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock deep dive', details: err.message });
  }
});

app.get('/sales_graph', async (req, res) => {
  try {
    const { range, start, end } = req.query;
    
    
    if (range === 'custom' && (!start || !end)) {
      return res.status(400).json({ error: 'Start and end dates are required for custom range' });
    }

   
    const [fuelCategory] = await connection.promise().query(
      "SELECT category_id FROM product_category WHERE LOWER(category_name) = 'fuel' LIMIT 1"
    );
    if (!fuelCategory.length) return res.status(404).json({ error: 'Fuel category not found' });
    const fuelCategoryId = fuelCategory[0].category_id;


    let dateFilter = '';
    let params = [];
    let groupBy = '';
    let selectLabel = '';
    let dateFormat = '%Y-%m-%d';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (range === 'today' || range === 'yesterday') {
      dateFilter = range === 'today'
        ? "AND DATE(o.created_at) = CURDATE()"
        : "AND DATE(o.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
      groupBy = 'HOUR(o.created_at)';
      selectLabel = "DATE_FORMAT(o.created_at, '%H:00')";
      dateFormat = '%H:00';
    } 
    else if (range === 'last7days') {
    dateFilter = "AND DATE(o.created_at) BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
      groupBy = 'DATE(o.created_at)';
      selectLabel = "DATE_FORMAT(o.created_at, '%Y-%m-%d')";
      dateFormat = '%Y-%m-%d';
    }
    else if (range === 'thismonth') {
      dateFilter = "AND MONTH(o.created_at) = MONTH(CURDATE()) AND YEAR(o.created_at) = YEAR(CURDATE())";
      groupBy = 'DATE(o.created_at)';
      selectLabel = "DATE_FORMAT(o.created_at, '%Y-%m-%d')";
      dateFormat = '%Y-%m-%d';
    }
    else if (range === 'custom') {
     
      const startDate = new Date(start);
      const endDate = new Date(end);
      const timeDiff = endDate - startDate;
      const dayDiff = timeDiff / (1000 * 60 * 60 * 24);
      
      dateFilter = "AND DATE(o.created_at) BETWEEN ? AND ?";
      params.push(start, end);
      
      if (dayDiff <= 31) {
        
        groupBy = 'DATE(o.created_at)';
        selectLabel = "DATE_FORMAT(o.created_at, '%Y-%m-%d')";
        dateFormat = '%Y-%m-%d';
      } else {
      
        groupBy = 'MONTH(o.created_at)';
        selectLabel = "DATE_FORMAT(o.created_at, '%Y-%m')";
        dateFormat = '%Y-%m';
      }
    }
    else if (range === 'thisyear') {
      dateFilter = "AND YEAR(o.created_at) = YEAR(CURDATE())";
      groupBy = 'MONTH(o.created_at)';
      selectLabel = "DATE_FORMAT(o.created_at, '%Y-%m')";
      dateFormat = '%Y-%m';
    }


    const [salesGraphRows] = await connection.promise().query(`
      SELECT 
        ${selectLabel} AS label,
        SUM(CASE WHEN p.category_id = ? THEN od.quantity * od.selling_price ELSE 0 END) AS fuel_sales,
        SUM(CASE WHEN p.category_id != ? THEN od.quantity * od.selling_price ELSE 0 END) AS other_sales
      FROM order_details od
      JOIN orders o ON od.order_id = o.order_id
      JOIN product_variations pv ON od.variations_id = pv.variations_id
      JOIN product p ON pv.product_id = p.product_id
      WHERE 1=1 ${dateFilter}
      GROUP BY ${groupBy}
      ORDER BY ${groupBy}
    `, [fuelCategoryId, fuelCategoryId, ...params]);

   
    const salesGraph = salesGraphRows.map(row => ({
      label: row.label,
      fuel: Number(row.fuel_sales) || 0,
      others: Number(row.other_sales) || 0
    }));

    res.status(200).json(salesGraph);
  } catch (err) {
    console.error('Error in /sales_graph:', err);
    res.status(500).json({ error: 'Failed to fetch sales graph', details: err.message });
  }
});

app.get('/customer-data', async (req, res) => {
  try {
    
    const [totalRows] = await connection.promise().query('SELECT COUNT(*) AS total FROM customer');
  
    const [statusRows] = await connection.promise().query(`
      SELECT customer_status, COUNT(*) AS count
      FROM customer
      GROUP BY customer_status
    `);
    logActivity({
      activityType: 'FETCH_CUSTOMER_DATA',
      tableName: 'customer',
      description: 'Fetched customer data for dashboard',
      performedBy: req.session?.admin?.first_name || 'System',
      performedById: req.session?.admin?.id || null,
      performedByRole: req.session?.admin?.admin_role || 'Admin',
      req,
      metadata: {
        totalCustomers: totalRows[0].total,
        statusCounts: statusRows.reduce((acc, row) => {
          acc[row.customer_status] = row.count;
          return acc;
        }, {})
      }
    })
   
    const [topRows] = await connection.promise().query(`
      SELECT c.customer_id, c.customer_fullname, COUNT(o.order_id) AS order_count
      FROM customer c
      LEFT JOIN orders o ON c.customer_id = o.customer_id
      GROUP BY c.customer_id, c.customer_fullname
      ORDER BY order_count DESC
      LIMIT 5
    `);

    const statusMap = { regular: 0, idle: 0, new: 0 };
    statusRows.forEach(r => { statusMap[r.customer_status] = r.count; });

    res.json({
      total_customers: totalRows[0].total,
      total_regular_customers: statusMap.regular || 0,
      total_idle_customers: statusMap.idle || 0,
      total_new_customers: statusMap.new || 0,
      top_customers: topRows
    });
    logActivity({
      activityType: 'CUSTOMER_DATA_FETCHED',
      tableName: 'customer',
      description: 'Successfully fetched customer data for dashboard',
      performedBy: req.session?.admin?.first_name || 'System',
      performedById: req.session?.admin?.id || null,
      performedByRole: req.session?.admin?.admin_role || 'Admin',
      req,
      metadata: {
        totalCustomers: totalRows[0].total,
        statusCounts: statusMap,
        topCustomers: topRows.map(c => ({
          customerId: c.customer_id,
          customerFullname: c.customer_fullname,
          orderCount: c.order_count
        }))
      }
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer data', details: err.message });
    logActivity({
      activityType: 'DB_ERROR',
      tableName: 'customer',
      description: 'Failed to fetch customer data for dashboard',
      performedBy: req.session?.admin?.first_name || 'System',
      performedById: req.session?.admin?.id || null,
      performedByRole: req.session?.admin?.admin_role || 'Admin',
      req,
      metadata: { error: err.message }

    })
  }
});


app.get('/most_ordered_category', (req, res) => {
  const { period, custom_start, custom_end } = req.query;

  let dateFilter = '';
  let params = [];

  if (period) {
    const now = new Date();
    const formatDate = (date) => date.toISOString().split('T')[0];
    switch (period) {
      case 'day': {
        const today = formatDate(now);
        dateFilter = "AND DATE(o.created_at) = ?";
        params.push(today);
        break;
      }
      case 'yesterday': {
    const yesterday = formatDate(new Date(Date.now() - 86400000));
    dateFilter = "AND DATE(o.created_at) = ?";
    params.push(yesterday);
    break;
}
case 'last7days': {
    const today = formatDate(now);
    const sevenDaysAgo = formatDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    dateFilter = "AND DATE(o.created_at) BETWEEN ? AND ?";
    params.push(sevenDaysAgo, today);
    break;
  }
      case 'week': {
        const weekStart = formatDate(new Date(now.setDate(now.getDate() - now.getDay())));
        const weekEnd = formatDate(new Date(now.setDate(now.getDate() - now.getDay() + 6)));
        dateFilter = "AND DATE(o.created_at) BETWEEN ? AND ?";
        params.push(weekStart, weekEnd);
        break;
      }
      case 'month': {
        const monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const monthEnd = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        dateFilter = "AND DATE(o.created_at) BETWEEN ? AND ?";
        params.push(monthStart, monthEnd);
        break;
      }
      case 'year': {
        const yearStart = formatDate(new Date(now.getFullYear(), 0, 1));
        const yearEnd = formatDate(new Date(now.getFullYear(), 11, 31));
        dateFilter = "AND DATE(o.created_at) BETWEEN ? AND ?";
        params.push(yearStart, yearEnd);
        break;
      }
      case 'custom': {
        if (!custom_start || !custom_end) {
          return res.status(400).json({ error: 'custom_start and custom_end are required for custom period' });
        }
        dateFilter = "AND DATE(o.created_at) BETWEEN ? AND ?";
        params.push(custom_start, custom_end);
        break;
      }
      default:
        return res.status(400).json({ error: 'Invalid period parameter. Must be day, week, month, year, or custom' });
    }
  }


  const query = `
    SELECT 
      pc.category_id, 
      pc.category_name, 
      COALESCE(SUM(od.quantity * od.selling_price), 0) AS total_sales_amount
    FROM product_category pc
    LEFT JOIN product p ON pc.category_id = p.category_id
    LEFT JOIN order_details od ON od.product_id = p.product_id
    LEFT JOIN orders o ON od.order_id = o.order_id
    ${dateFilter ? 'WHERE 1=1 ' + dateFilter : ''}
    GROUP BY pc.category_id, pc.category_name
    ORDER BY total_sales_amount DESC
  `;

  connection.query(query, params, (err, results) => {
    if (err) {
      logActivity({
        activityType: 'DB_ERROR',
        tableName: 'order_details',
        description: 'Failed to fetch ordered product categories',
        performedById: req.session?.userId || 'unknown',
        performedByRole: req.session?.userRole || 'unknown',
        req,
        significance: 'high',
        metadata: { error: err.message }
      });
      return res.status(500).json({ error: 'Failed to fetch ordered categories', details: err.message });
    }
    res.status(200).json(results);
  });
});


function syncProductStockQty() {
  console.log('Running product stock sync cron job...');
  const getProductsQuery = 'SELECT product_id, current_product_stock_qty_number FROM product';
  connection.query(getProductsQuery, (err, products) => {
    if (err) {
      console.error('Cron job: Failed to fetch products:', err.message);
      return;
    }
    for (const product of products) {
      const { product_id, current_product_stock_qty_number } = product;
      const getVariationsQuery = 'SELECT current_variations_stock_qty_number FROM product_variations WHERE product_id = ?';
      connection.query(getVariationsQuery, [product_id], (vErr, variations) => {
        if (vErr) {
          console.error(`Cron job: Failed to fetch variations for product ${product_id}:`, vErr.message);
          return;
        }
        if (!variations.length) return; 

        const sum = variations.reduce((acc, v) => acc + (Number(v.current_variations_stock_qty_number) || 0), 0);

        if (sum !== Number(current_product_stock_qty_number)) {
          const updateQuery = 'UPDATE product SET current_product_stock_qty_number = ? WHERE product_id = ?';
          connection.query(updateQuery, [sum, product_id], (uErr) => {
            if (uErr) {
              console.error(`Cron job: Failed to update product stock for ${product_id}:`, uErr.message);
            } else {
              console.log(`Cron job: Updated product_id ${product_id} stock to ${sum}`);
            }
          });
        }
      });
    }
  });
}


app.get('/active_staff_today', async (req, res) => {
  try {
    let dayName;
    if (req.query.day) {
      dayName = req.query.day.toLowerCase();
    } else {
      const today = new Date();
      dayName = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    }

    const [rows] = await connection.promise().query('SELECT staff_id, work_days FROM staff_shifts');

    let count = 0;
    rows.forEach(row => {
      if (row.work_days) {
        const days = row.work_days.toLowerCase().split(/[\s,]+/).map(d => d.trim());
        if (days.includes(dayName)) count++;
      }
    });

    res.json({ total_active_staffs: count, day: dayName.charAt(0).toUpperCase() + dayName.slice(1), total_staffs: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active staff count', details: err.message });
  }
});


const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: 'Too many report requests from this IP, please try again later'
});


const validateDate = (dateString) => {
  return validator.isDate(dateString, { format: 'YYYY-MM-DD', strictMode: true });
};

app.get('/order_report', reportLimiter, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
   const { 
    admin_id, 
    period = 'day', 
    custom_start, 
    custom_end, 
    summary = 'true', 
    details = 'false', 
    payment_methods = 'false', 
    product_breakdown = 'false', 
    format = 'json',
    cashier,
    order_method,
    category_type,
    page = 1,
    pageSize = 20
  } = req.query;

if (!admin_id) {
  return res.status(400).json({ error: 'admin_id is required as a query parameter' });
}
try {
  const [adminRows] = await connection.promise().query(
    'SELECT admin_role FROM admin WHERE id = ?',
    [admin_id]
  );

  if (!adminRows.length) {
    return res.status(403).json({ error: 'Admin not found' });
  }


  if (adminRows[0].admin_role !== 'super_admin' && adminRows[0].admin_role !== 'dev') {
    return res.status(403).json({ error: 'Access denied: Only super_admin or dev can access this report.' });
  }
} catch (err) {
  return res.status(500).json({ error: 'Failed to verify admin', details: err.message });
}



  
   if (!['day', 'month', 'year', 'custom'].includes(period)) {
    return res.status(400).json({ error: 'Invalid period parameter' });
  }

  
  if (period === 'custom') {
    if (!custom_start || !custom_end) {
      return res.status(400).json({ error: 'custom_start and custom_end required' });
    }
    if (!validateDate(custom_start) || !validateDate(custom_end)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    if (new Date(custom_start) > new Date(custom_end)) {
      return res.status(400).json({ error: 'custom_start must be before custom_end' });
    }
  }

 
  const validateBoolean = (param) => ['true', 'false'].includes(param);
  if (!validateBoolean(summary) || !validateBoolean(details) || 
      !validateBoolean(payment_methods) || !validateBoolean(product_breakdown)) {
    return res.status(400).json({ error: 'Boolean parameters must be true or false' });
  }

  
  if (!['json', 'pdf'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format parameter' });
  }

   const pageInt = parseInt(page);
  const pageSizeInt = parseInt(pageSize);
  if (isNaN(pageInt) || isNaN(pageSizeInt) || pageInt < 1 || pageSizeInt < 1) {
    return res.status(400).json({ error: 'Invalid pagination parameters' });
  }


 
  let where = "o.status = 'order_made'";
  let params = [];
  const now = new Date();
  const formatDate = d => d.toISOString().slice(0, 10);


  switch (period) {
    case 'day': {
      where += " AND DATE(o.created_at) = ?";
      params.push(formatDate(now));
      break;
    }
    case 'month': {
      where += " AND MONTH(o.created_at) = MONTH(CURDATE()) AND YEAR(o.created_at) = YEAR(CURDATE())";
      break;
    }
    case 'year': {
      where += " AND YEAR(o.created_at) = YEAR(CURDATE())";
      break;
    }
    case 'custom': {
      if (!custom_start || !custom_end) return res.status(400).json({ error: 'custom_start and custom_end required' });
      where += " AND DATE(o.created_at) BETWEEN ? AND ?";
      params.push(custom_start, custom_end);
      break;
    }
    default: break;
  }

    if (cashier) {
    where += " AND o.cashier_name = ?";
    params.push(cashier);
  }

 
  if (order_method) {
    where += " AND o.order_method = ?";
    params.push(order_method);
  }

  let categoryJoin = "";
  if (category_type) {
    categoryJoin = `
      JOIN product_variations pv ON od.variations_id = pv.variations_id
      JOIN product p ON pv.product_id = p.product_id
      JOIN product_category pc ON p.category_id = pc.category_id
    `;
    where += " AND LOWER(pc.category_name) = ?";
    params.push(category_type.toLowerCase());
  }

  try {

    if (period === 'year' || (period === 'custom' && 
        (new Date(custom_end) - new Date(custom_start)) > 30 * 24 * 60 * 60 * 1000)) {
      if (format !== 'json') {
        return res.status(400).json({ error: 'PDF format is not supported for large reports' });
      }
      
      return res.status(202).json({ 
        message: 'Large report requested. Processing asynchronously...',
        report_id: generateReportId(),
        status_url: '/report_status/' + generateReportId()
      });
    }

      
  let summaryData = {};
if (summary === 'true') {
  
  const [summaryRows] = await connection.promise().query(
   `SELECT COUNT(*) as total_orders, 
        COALESCE(SUM(od.quantity * od.selling_price),0) as total_sales, 
        COALESCE(SUM(o.tax),0) as total_tax, 
        COALESCE(SUM(o.discount),0) as total_discount
 FROM orders o
 JOIN order_details od ON o.order_id = od.order_id
 ${category_type ? categoryJoin : ''}
 WHERE ${where}`, params
  );
  summaryData = summaryRows[0];

 
  const [cogsRows] = await connection.promise().query(
    `SELECT COALESCE(SUM(od.quantity * od.cost_price),0) as total_cogs
     FROM orders o
     JOIN order_details od ON o.order_id = od.order_id
     ${category_type ? categoryJoin : ''}
     WHERE ${where}`, params
  );
  summaryData.total_cogs = Number(cogsRows[0].total_cogs) || 0;

  
  summaryData.gross_profit = (Number(summaryData.total_sales) || 0) - summaryData.total_cogs;

  
  const [orderMethodRows] = await connection.promise().query(
    `SELECT o.order_method, COUNT(*) as count
     FROM orders o
     ${category_type ? `
       JOIN order_details od ON o.order_id = od.order_id
       ${categoryJoin}
     ` : ''}
     WHERE ${where}
     GROUP BY o.order_method`, params
  );
  let at_station_orders = 0, online_orders = 0;
  orderMethodRows.forEach(row => {
    if (row.order_method === 'at_station_order') at_station_orders = row.count;
    if (row.order_method === 'online_order') online_orders = row.count;
  });
  summaryData.at_station_orders = at_station_orders;
  summaryData.online_orders = online_orders;
  summaryData.order_method_summary = `${at_station_orders}/${online_orders}`;
}

    
   let orderDetails = [];
    if (details === 'true') {
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      const [detailsRows] = await connection.promise().query(
        `SELECT o.order_id, o.customer_fullname, o.order_method, o.total_order_amount, 
         o.tax, o.discount, o.payment_method, o.created_at, o.status, o.cashier_name,
         od.variations_id, od.product_name, od.quantity, od.selling_price, od.cost_price, od.variation_image, od.product_id
         FROM orders o
         JOIN order_details od ON o.order_id = od.order_id
         ${category_type ? categoryJoin : ''}
         WHERE ${where}
         ORDER BY o.created_at DESC
         LIMIT ? OFFSET ?`, 
        [...params, parseInt(pageSize), offset]
      );
      orderDetails = detailsRows;
    }

     let paymentStats = [];
    if (payment_methods === 'true') {
      const [payRows] = await connection.promise().query(
        `SELECT o.payment_method, COUNT(*) as count, COALESCE(SUM(o.total_order_amount),0) as total
         FROM orders o
         ${category_type ? `
           JOIN order_details od ON o.order_id = od.order_id
           ${categoryJoin}
         ` : ''}
         WHERE ${where} GROUP BY o.payment_method`, params
      );
      paymentStats = payRows;
    }

     let productStats = [];
    if (product_breakdown === 'true') {
      const [prodRows] = await connection.promise().query(
        `SELECT od.product_id, od.product_name, od.variations_id, SUM(od.quantity) as total_qty, 
           SUM(od.quantity * od.selling_price) as total_sales, pc.category_name
         FROM order_details od
         JOIN orders o ON od.order_id = o.order_id
         JOIN product_variations pv ON od.variations_id = pv.variations_id
         JOIN product p ON pv.product_id = p.product_id
         JOIN product_category pc ON p.category_id = pc.category_id
         WHERE ${where}
         GROUP BY od.product_id, od.product_name, od.variations_id, pc.category_name
         ORDER BY total_sales DESC`, params
      );
      productStats = prodRows;
    }


    
      const report = {
      period,
      ...(period === 'custom' && { custom_start, custom_end }),
      summary: summaryData,
      order_details: orderDetails,
      payment_methods: paymentStats,
      product_breakdown: productStats,
      ...(details === 'true' && { 
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total: await getTotalCount(where, params)
        }
      })
    };

    
    if (format === 'pdf') {
  const PDFDocument = require('pdfkit');
  const { Table } = require('pdfkit-table');


  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="order_report.pdf"');
  doc.pipe(res);

  doc.fontSize(18).text('Order Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Period: ${period}`);
  if (period === 'custom') doc.text(`From: ${custom_start} To: ${custom_end}`);
  doc.moveDown();

 
  doc.fontSize(14).text('Summary');
  Object.entries(summaryData).forEach(([k, v]) => doc.text(`${k}: ${v}`));
  doc.moveDown();

 
  if (payment_methods === 'true' && paymentStats.length) {
    doc.fontSize(14).text('Payment Methods');
    paymentStats.forEach(pm => doc.text(`${pm.payment_method}: ${pm.count} orders, ₦${pm.total}`));
    doc.moveDown();
  }

 
  if (product_breakdown === 'true' && productStats.length) {
    doc.fontSize(14).text('');
    productStats.forEach(p =>
      doc.text(`${p.product_name} (Var: ${p.variations_id}): Qty ${p.total_qty}, ₦${p.total_sales}`)
    );
    doc.moveDown();
  }

 
 if (details === 'true' && orderDetails.length) {
  const table = {
    title: "Order Details",
    headers: ["Order ID", "Customer", "Amount", "Tax", "Payment", "Date", "Selling Price", 
      "Cost Price", "Product Name", "Variation ID", "Variation Image", "Quantity", "Order Method", "Discount",
       "Payment Method", "Status", "Created At", "Cashier Name"
      ],
    rows: orderDetails.map(o => [
      o.order_id,
      o.customer_fullname,
      `₦${o.total_order_amount}`,
      `₦${o.tax}`,
      o.payment_method,
      o.created_at,
      o.selling_price,
      o.cost_price,
      o.product_name,
      o.variations_id,
      o.variation_image ? { image: o.variation_image, width: 50, height: 50 } : 'N/A',
      o.quantity,
      o.order_method,
      `₦${o.discount}`,
      o.payment_method,
      o.status || 'N/A',
      o.created_at,
      o.cashier_name || 'N/A',
      
    ])
  };
  await doc.table(table);
  doc.moveDown();
}

  doc.end();
  return;
}

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate report', details: err.message });
  }
});

async function getTotalCount(where, params) {
  const [countRows] = await connection.promise().query(
    `SELECT COUNT(*) as total FROM orders o WHERE ${where}`, params
  );
  return countRows[0].total;
}


function generateReportId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

app.post('/roles', async (req, res) => {
  const { admin_id, role_name, permissions } = req.body;

  if (!admin_id || !role_name || !permissions) {
    return res.status(400).json({ error: 'admin_id, role_name, and permissions are required' });
  }

  try {
    
    const [adminRows] = await connection.promise().query(
      'SELECT admin_role FROM admin WHERE id = ?', [admin_id]
    );
    if (!adminRows.length || adminRows[0].admin_role !== 'super_admin' && adminRows[0].admin_role !== 'dev') {
      return res.status(403).json({ error: 'Only super_admin or dev can create roles' });
    }

   
    const role_id = Math.random().toString(36).substring(2, 15);
    await connection.promise().query(
      'INSERT INTO roles (role_id, role_name, permissions, created_by) VALUES (?, ?, ?, ?)',
      [role_id, role_name, JSON.stringify(permissions), admin_id]
    );

    res.status(201).json({ message: 'Role created', role_id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Role name already exists' });
    }
    res.status(500).json({ error: 'Failed to create role', details: err.message });
  }
});

app.get('/roles', async (req, res) => {
  try {
    const [rows] = await connection.promise().query('SELECT role_id, role_name, permissions, created_at FROM roles');
    res.json(rows.map(r => ({
      ...r,
      permissions: JSON.parse(r.permissions)
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch roles', details: err.message });
  }
});

app.delete('/roles/:role_id', async (req, res) => {
  const { admin_id } = req.body;
  const { role_id } = req.params;

  if (!admin_id) {
    return res.status(400).json({ error: 'admin_id is required' });
  }

  try {
    const [adminRows] = await connection.promise().query(
      'SELECT admin_role FROM admin WHERE id = ?', [admin_id]
    );
    if (!adminRows.length || adminRows[0].admin_role !== 'super_admin' && adminRows[0].admin_role !== 'dev') {
      return res.status(403).json({ error: 'Only super_admin or dev can delete roles' });
    }

    const [result] = await connection.promise().query(
      'DELETE FROM roles WHERE role_id = ?', [role_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    res.json({ message: 'Role deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete role', details: err.message });
  }
});

app.put('/roles/:role_id', async (req, res) => {
  const { admin_id, role_name, permissions } = req.body;
  const { role_id } = req.params;
  if (!admin_id || !role_name || !permissions) {
    return res.status(400).json({ error: 'admin_id, role_name, and permissions are required' });
  }

  try {
    const [adminRows] = await connection.promise().query(
      'SELECT admin_role FROM admin WHERE id = ?', [admin_id]
    );
    if (!adminRows.length || adminRows[0].admin_role !== 'super_admin' && adminRows[0].admin_role !== 'dev') {
      return res.status(403).json({ error: 'Only super_admin or dev can update roles' });
    }
    const [result] = await connection.promise().query(
      'UPDATE roles SET role_name = ?, permissions = ? WHERE role_id = ?',
      [role_name, JSON.stringify(permissions), role_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    res.json({ message: 'Role updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Role name already exists' });
    }
    res.status(500).json({ error: 'Failed to update role', details: err.message });
  }
  
});


app.post('/owner_info/:admin_id', upload.single('company_logo'), async (req, res) => {
  const { admin_id } = req.params;
  const {
    first_name,
    last_name,
    phone_number,
    email,
    address,
    company_email,
    company_name
  } = req.body;
  const company_logo = req.file ? req.file.filename : undefined;

  if (!admin_id) {
    return res.status(400).json({ error: 'admin_id is required' });
  }

  try {
   
    const [rows] = await connection.promise().query(
      'SELECT * FROM owner_info WHERE admin_id = ? LIMIT 1', [admin_id]
    );
    const isUpdate = rows.length > 0;
    const ownerId = isUpdate ? rows[0].id : generateId();

    
    const fields = [];
    const values = [];
    if (first_name) { fields.push('first_name = ?'); values.push(first_name); }
    if (last_name) { fields.push('last_name = ?'); values.push(last_name); }
    if (phone_number) { fields.push('phone_number = ?'); values.push(phone_number); }
    if (email) { fields.push('email = ?'); values.push(email); }
    if (address) { fields.push('address = ?'); values.push(address); }
    if (company_email) { fields.push('company_email = ?'); values.push(company_email); }
    if (company_name) { fields.push('company_name = ?'); values.push(company_name); }
    if (company_logo) { fields.push('company_logo = ?'); values.push(company_logo); }

   
    const adminFields = [];
    const adminValues = [];
    if (first_name) { adminFields.push('first_name = ?'); adminValues.push(first_name); }
    if (last_name) { adminFields.push('last_name = ?'); adminValues.push(last_name); }
    if (phone_number) { adminFields.push('phone_number = ?'); adminValues.push(phone_number); }
    if (email) { adminFields.push('email = ?'); adminValues.push(email); }
    if (adminFields.length > 0) {
      await connection.promise().query(
        `UPDATE admin SET ${adminFields.join(', ')} WHERE id = ?`,
        [...adminValues, admin_id]
      );
    }

   
    if (isUpdate) {
      if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      await connection.promise().query(
        `UPDATE owner_info SET ${fields.join(', ')} WHERE admin_id = ?`,
        [...values, admin_id]
      );
      res.json({ message: 'Owner info updated' });
    } else {
      if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to insert' });
      }
      await connection.promise().query(
        `INSERT INTO owner_info (id, admin_id, ${fields.map(f => f.split('=')[0].trim()).join(', ')}) VALUES (?, ?, ${fields.map(() => '?').join(', ')})`,
        [ownerId, admin_id, ...values]
      );
      res.json({ message: 'Owner info created' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save owner info', details: err.message });
  }
});

app.get('/owner_info/:admin_id', async (req, res) => {
  const { admin_id } = req.params;
  if (!admin_id) return res.status(400).json({ error: 'admin_id is required' });
  try {
    const [rows] = await connection.promise().query(
      'SELECT * FROM owner_info LIMIT 1'
    );
    if (!rows.length) return res.status(404).json({ error: 'Owner info not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch owner info', details: err.message });
  }
});


syncProductStockQty();
console.log('Product stock sync cron job initialized.');
cron.schedule('*/5 * * * *', syncProductStockQty);

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.stack || err.message);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});