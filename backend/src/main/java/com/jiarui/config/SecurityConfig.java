package com.jiarui.config;

import com.jiarui.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;

@Configuration
@EnableWebSecurity
@EnableGlobalMethodSecurity(prePostEnabled = true)
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors().and()
            .csrf().disable()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .and()
            .authorizeRequests()
            // 公开端点
            .antMatchers("/api/auth/login", "/api/auth/refresh").permitAll()
            .antMatchers("/api/wx/callback", "/api/wx/auth/**").permitAll()
            // 健康检查和管理端点
            .antMatchers("/actuator/**").permitAll()
            // 静态资源
            .antMatchers("/static/**", "/public/**").permitAll()
            // 客户接口: 需要 customer 角色
            .antMatchers("/api/wx/waybill/**", "/api/wx/billing/**").hasAnyRole("CUSTOMER", "ADMIN")
            .antMatchers("/api/wx/track/**").hasAnyRole("CUSTOMER", "ADMIN")
            // 司机接口: 需要 driver 角色
            .antMatchers("/api/driver/**").hasAnyRole("DRIVER", "ADMIN", "DISPATCHER")
            // 管理后台: admin / dispatcher / finance
            .antMatchers("/api/admin/**").hasAnyRole("ADMIN", "DISPATCHER", "FINANCE")
            .antMatchers("/api/admin/user/**").hasRole("ADMIN")
            // 调度接口
            .antMatchers("/api/dispatch/**").hasAnyRole("ADMIN", "DISPATCHER")
            // 费用接口
            .antMatchers("/api/cost/**").hasAnyRole("ADMIN", "FINANCE")
            .antMatchers("/api/billing/**").hasAnyRole("ADMIN", "FINANCE")
            // 其他请求需认证
            .anyRequest().authenticated()
            .and()
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(Arrays.asList("*"));
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(Arrays.asList("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration authenticationConfiguration) throws Exception {
        return authenticationConfiguration.getAuthenticationManager();
    }
}
