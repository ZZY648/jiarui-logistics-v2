const express = require('express');
const bcrypt = require('bcryptjs');

function createUserRouter({ db, store, auth, hasRole }) {
  const router = express.Router();
  const { insert, findById, updateById, deleteById } = store;
  const adminOnly = hasRole('admin');

  router.get('/', auth, adminOnly, (req, res) => {
    const list = db.users.map(user => ({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      phone: user.phone || '',
      status: user.status,
      created_at: user.created_at
    }));
    res.json({ code: 200, data: list });
  });

  router.post('/', auth, adminOnly, (req, res) => {
    const { username, password, displayName, role, phone } = req.body;
    if (!username || !password) return res.json({ code: 400, message: '用户名和密码必填' });
    if (db.users.find(user => user.username === username)) return res.json({ code: 400, message: '用户名已存在' });
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = insert('users', { username, password_hash: passwordHash, display_name: displayName || username, role: role || 'dispatcher', phone: phone || '', status: 1 });
    res.json({ code: 200, data: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, phone: user.phone, status: user.status } });
  });

  router.put('/:id', auth, adminOnly, (req, res) => {
    const id = parseInt(req.params.id);
    const body = req.body;
    const updates = {};
    if (body.username && body.username !== db.users.find(user => user.id === id)?.username) {
      if (db.users.find(user => user.username === body.username && user.id !== id)) return res.json({ code: 400, message: '用户名已存在' });
      updates.username = body.username;
    }
    ['display_name', 'role', 'phone', 'status'].forEach(key => { if (body[key] !== undefined) updates[key] = body[key]; });
    const user = updateById('users', id, updates);
    if (!user) return res.json({ code: 404, message: '用户不存在' });
    if (body.password) updateById('users', id, { password_hash: bcrypt.hashSync(body.password, 10) });
    res.json({ code: 200, data: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, phone: user.phone, status: user.status } });
  });

  router.put('/:id/password', auth, adminOnly, (req, res) => {
    const { password } = req.body;
    if (!password) return res.json({ code: 400, message: '新密码必填' });
    const user = updateById('users', parseInt(req.params.id), { password_hash: bcrypt.hashSync(password, 10) });
    if (!user) return res.json({ code: 404, message: '用户不存在' });
    res.json({ code: 200, message: '密码已重置' });
  });

  router.delete('/:id', auth, adminOnly, (req, res) => {
    const id = parseInt(req.params.id);
    if (id === req.user.userId) return res.json({ code: 400, message: '不能操作自己的账号' });
    if (req.query.hard === '1') {
      const user = findById('users', id);
      if (!user) return res.json({ code: 404, message: '用户不存在' });
      if (db.waybills.some(waybill => waybill.customer_id === user.customer_id && user.user_type === 'customer')) return res.json({ code: 400, message: '该客户有关联运单，无法彻底删除。请先禁用。' });
      deleteById('users', id);
      return res.json({ code: 200, message: '已彻底删除' });
    }
    const user = updateById('users', id, { status: 0 });
    if (!user) return res.json({ code: 404, message: '用户不存在' });
    return res.json({ code: 200, message: '已禁用' });
  });

  return router;
}

module.exports = { createUserRouter };