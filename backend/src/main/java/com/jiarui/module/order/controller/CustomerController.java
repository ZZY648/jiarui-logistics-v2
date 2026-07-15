package com.jiarui.module.order.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jiarui.common.Result;
import com.jiarui.module.order.entity.AddressBook;
import com.jiarui.module.order.entity.Customer;
import com.jiarui.module.order.mapper.AddressBookMapper;
import com.jiarui.module.order.mapper.CustomerMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/admin/customer")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerMapper customerMapper;
    private final AddressBookMapper addressBookMapper;

    // ==================== 客户 CRUD ====================
    @GetMapping
    public Result<List<Customer>> list() {
        return Result.success(customerMapper.selectList(
                new LambdaQueryWrapper<Customer>().orderByDesc(Customer::getCreatedAt)));
    }

    @GetMapping("/{id}")
    public Result<Customer> get(@PathVariable Long id) {
        return Result.success(customerMapper.selectById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Customer> create(@Valid @RequestBody Customer customer) {
        customerMapper.insert(customer);
        return Result.success(customer);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Customer> update(@PathVariable Long id, @RequestBody Customer customer) {
        customer.setId(id);
        customerMapper.updateById(customer);
        return Result.success(customerMapper.selectById(id));
    }

    // ==================== 地址管理 ====================
    @GetMapping("/{customerId}/address")
    public Result<List<AddressBook>> listAddress(@PathVariable Long customerId) {
        return Result.success(addressBookMapper.selectByCustomerId(customerId));
    }

    @PostMapping("/{customerId}/address")
    public Result<AddressBook> addAddress(@PathVariable Long customerId,
                                           @RequestBody AddressBook address) {
        address.setCustomerId(customerId);
        addressBookMapper.insert(address);
        return Result.success(address);
    }

    @PutMapping("/{customerId}/address/{id}")
    public Result<AddressBook> updateAddress(@PathVariable Long id,
                                              @RequestBody AddressBook address) {
        address.setId(id);
        addressBookMapper.updateById(address);
        return Result.success(addressBookMapper.selectById(id));
    }

    @DeleteMapping("/{customerId}/address/{id}")
    public Result<Void> deleteAddress(@PathVariable Long id) {
        addressBookMapper.deleteById(id);
        return Result.success();
    }
}
