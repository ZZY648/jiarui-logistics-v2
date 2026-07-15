const jwt = require('jsonwebtoken');

function createAuthMiddleware(jwtSecret) {
  return function auth(req, res, next) {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录' });
    }

    try {
      req.user = jwt.verify(authorization.slice(7), jwtSecret);
      return next();
    } catch (error) {
      return res.status(401).json({ code: 401, message: '登录已过期' });
    }
  };
}

function hasRole(...roles) {
  return function roleGuard(req, res, next) {
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ code: 403, message: '无权限' });
  };
}

function customerScope(req, res, next) {
  if (req.user.userType === 'customer' && req.user.customerId) {
    req.customerScope = req.user.customerId;
  }
  return next();
}

module.exports = { createAuthMiddleware, hasRole, customerScope };
