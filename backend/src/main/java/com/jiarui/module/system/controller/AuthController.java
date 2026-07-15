package com.jiarui.module.system.controller;

import com.jiarui.common.Result;
import com.jiarui.module.system.dto.LoginRequest;
import com.jiarui.module.system.dto.LoginResponse;
import com.jiarui.module.system.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public Result<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return Result.success(authService.login(request));
    }

    @PostMapping("/refresh")
    public Result<LoginResponse> refresh(@RequestHeader("Authorization") String bearerToken) {
        String token = bearerToken.replace("Bearer ", "");
        return Result.success(authService.refresh(token));
    }
}
