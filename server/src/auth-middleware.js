const jwt = require("jsonwebtoken");
const config = require("./config");

function getTokenFromHeader(headerValue) {
  if (!headerValue) return null;
  const [prefix, token] = headerValue.split(" ");
  if (prefix !== "Bearer" || !token) return null;
  return token;
}

function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: "Missing authorization token." });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.auth = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired session token." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ message: "Authentication required." });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
