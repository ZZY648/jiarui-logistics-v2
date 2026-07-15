package com.jiarui;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@MapperScan("com.jiarui.module.**.mapper")
@EnableScheduling
public class JiaruiApplication {

    public static void main(String[] args) {
        SpringApplication.run(JiaruiApplication.class, args);
    }
}
