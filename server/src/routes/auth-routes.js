const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function createAuthRouter({ db, auth, jwtSecret }) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(item => item.username === username && item.status === 1);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.json({ code: 401, message: '用户名或密码错误' });
    }

    const driver = user.role === 'driver' ? db.drivers.find(item => item.user_id === user.id) : null;
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      userType: user.user_type || 'internal',
      customerId: user.customer_id || null,
      driverId: driver ? driver.id : null
    };
    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '24h' });

    return res.json({
      code: 200,
      message: 'success',
      data: { ...tokenPayload, accessToken: token }
    });
  });

  router.get('/me', auth, (req, res) => res.json({ code: 200, data: req.user }));

  return router;
}

module.exports = { createAuthRouter };