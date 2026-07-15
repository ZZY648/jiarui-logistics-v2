const express = require('express');

function createCustomerRouter({ db, store, auth, hasRole, customerScope }) {
  const router = express.Router();
  const { insert, findById, findByField, updateById, deleteById } = store;
  const readRoles = hasRole('admin', 'ops_manager', 'dispatcher', 'finance_manager', 'finance', 'customer_service', 'boss', 'customer');

  router.get('/', auth, customerScope, readRoles, (req, res) => {
    const all = req.query.all === '1';
    const list = all ? db.customers : db.customers.filter(customer => customer.status === 1);
    res.json({ code: 200, data: req.customerScope ? list.filter(customer => customer.id === req.customerScope) : list });
  });

  router.get('/:id', auth, customerScope, readRoles, (req, res) => {
    const customer = findById('customers', parseInt(req.params.id));
    if (!customer) return res.json({ code: 404, message: '客户不存在' });
    if (req.customerScope && customer.id !== req.customerScope) return res.json({ code: 403, message: '无权限' });
    return res.json({ code: 200, data: { ...customer, addresses: findByField('addressBook', 'customer_id', customer.id) } });
  });

  router.post('/', auth, hasRole('admin', 'finance_manager', 'finance'), (req, res) => {
    const maxCode = db.customers.reduce((max, customer) => {
      const number = parseInt(customer.customer_code?.replace('KH', ''));
      return number > max ? number : max;
    }, 0);
    const body = req.body;
    const customer = insert('customers', {
      customer_code: `KH${String(maxCode + 1).padStart(3, '0')}`,
      company_name: body.company_name,
      short_name: body.short_name || body.company_name,
      contact_name: body.contact_name || '',
      contact_phone: body.contact_phone || '',
      province: body.province || '',
      city: body.city || '',
      district: body.district || '',
      address_detail: body.address_detail || '',
      settlement_type: body.settlement_type || 'monthly',
      credit_limit: body.credit_limit || 0,
      discount_rate: body.discount_rate || 1.0,
      status: 1
    });
    if (body.address_name) {
      insert('addressBook', { customer_id: customer.id, address_name: body.address_name, contact_name: body.contact_name || '', contact_phone: body.contact_phone || '', province: body.province || '', city: body.city || '', district: body.district || '', address_detail: body.address_detail || '', is_default: 1 });
    }
    res.json({ code: 200, data: customer });
  });

  router.put('/:id', auth, hasRole('admin', 'finance_manager', 'finance'), (req, res) => {
    const updates = {};
    ['company_name', 'short_name', 'contact_name', 'contact_phone', 'province', 'city', 'district', 'address_detail', 'settlement_type', 'credit_limit', 'discount_rate', 'status'].forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    const customer = updateById('customers', parseInt(req.params.id), updates);
    if (!customer) return res.json({ code: 404, message: '客户不存在' });
    return res.json({ code: 200, data: customer });
  });

  router.delete('/:id', auth, hasRole('admin'), (req, res) => {
    const id = parseInt(req.params.id);
    const customer = findById('customers', id);
    if (!customer) return res.json({ code: 404, message: '客户不存在' });
    if (req.query.hard === '1') {
      if (db.waybills.some(waybill => waybill.customer_id === id)) return res.json({ code: 400, message: '该客户有关联运单记录,无法彻底删除。请先停用。' });
      db.addressBook.filter(address => address.customer_id === id).map(address => address.id).forEach(addressId => deleteById('addressBook', addressId));
      deleteById('customers', id);
      return res.json({ code: 200, message: '已彻底删除' });
    }
    updateById('customers', id, { status: 0 });
    return res.json({ code: 200, message: '已停用' });
  });

  router.get('/:id/address', auth, customerScope, readRoles, (req, res) => {
    const customerId = parseInt(req.params.id);
    if (req.customerScope && customerId !== req.customerScope) return res.json({ code: 403, message: '无权限' });
    return res.json({ code: 200, data: findByField('addressBook', 'customer_id', customerId) });
  });

  return router;
}

function createAddressRouter({ store, auth, hasRole }) {
  const router = express.Router();
  const { insert, updateById, deleteById } = store;

  router.post('/', auth, hasRole('admin', 'ops_manager', 'dispatcher', 'finance_manager', 'finance'), (req, res) => {
    const { customerId, addressName, contactName, contactPhone, province, city, district, addressDetail, isDefault } = req.body;
    if (!customerId) return res.json({ code: 400, message: '缺少客户ID' });
    const address = insert('addressBook', { customer_id: parseInt(customerId), address_name: addressName || '', contact_name: contactName || '', contact_phone: contactPhone || '', province: province || '', city: city || '', district: district || '', address_detail: addressDetail || '', is_default: isDefault ? 1 : 0 });
    return res.json({ code: 200, data: address });
  });

  router.put('/:id', auth, hasRole('admin', 'ops_manager', 'dispatcher'), (req, res) => {
    const updates = {};
    ['address_name', 'contact_name', 'contact_phone', 'province', 'city', 'district', 'address_detail', 'is_default'].forEach(key => {
      if (req.body[key] !== undefined) updates[key] = key === 'is_default' ? (req.body[key] ? 1 : 0) : req.body[key];
    });
    const address = updateById('addressBook', parseInt(req.params.id), updates);
    if (!address) return res.json({ code: 404, message: '地址不存在' });
    return res.json({ code: 200, data: address });
  });

  router.delete('/:id', auth, hasRole('admin'), (req, res) => {
    if (!deleteById('addressBook', parseInt(req.params.id))) return res.json({ code: 404, message: '地址不存在' });
    return res.json({ code: 200, message: '已删除' });
  });

  return router;
}

module.exports = { createCustomerRouter, createAddressRouter };