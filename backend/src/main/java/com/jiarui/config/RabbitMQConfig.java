package com.jiarui.config;

import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    // ==================== 交换机定义 ====================
    public static final String EXCHANGE_WAYBILL = "waybill.exchange";
    public static final String EXCHANGE_NOTIFICATION = "notification.exchange";
    public static final String EXCHANGE_EXCEPTION = "exception.exchange";

    // ==================== 队列定义 ====================
    public static final String QUEUE_WAYBILL_STATUS = "waybill.status.queue";
    public static final String QUEUE_NOTIFICATION_SEND = "notification.send.queue";
    public static final String QUEUE_EXCEPTION_CREATED = "exception.created.queue";
    public static final String QUEUE_COST_CALCULATE = "cost.calculate.queue";
    public static final String QUEUE_GPS_MATCH = "gps.match.queue";
    public static final String QUEUE_BILLING_GENERATE = "billing.generate.queue";

    // ==================== 路由键 ====================
    public static final String RK_WAYBILL_STATUS = "waybill.status.changed";
    public static final String RK_NOTIFICATION_SEND = "notification.send";
    public static final String RK_EXCEPTION_CREATED = "exception.created";
    public static final String RK_COST_CALCULATE = "cost.calculate";
    public static final String RK_GPS_MATCH = "gps.match";
    public static final String RK_BILLING_GENERATE = "billing.generate";

    // ==================== 交换机 Bean ====================
    @Bean
    public TopicExchange waybillExchange() {
        return new TopicExchange(EXCHANGE_WAYBILL, true, false);
    }

    @Bean
    public TopicExchange notificationExchange() {
        return new TopicExchange(EXCHANGE_NOTIFICATION, true, false);
    }

    @Bean
    public TopicExchange exceptionExchange() {
        return new TopicExchange(EXCHANGE_EXCEPTION, true, false);
    }

    // ==================== 队列 Bean ====================
    @Bean
    public Queue waybillStatusQueue() {
        return QueueBuilder.durable(QUEUE_WAYBILL_STATUS).build();
    }

    @Bean
    public Queue notificationSendQueue() {
        return QueueBuilder.durable(QUEUE_NOTIFICATION_SEND).build();
    }

    @Bean
    public Queue exceptionCreatedQueue() {
        return QueueBuilder.durable(QUEUE_EXCEPTION_CREATED).build();
    }

    @Bean
    public Queue costCalculateQueue() {
        return QueueBuilder.durable(QUEUE_COST_CALCULATE).build();
    }

    @Bean
    public Queue gpsMatchQueue() {
        return QueueBuilder.durable(QUEUE_GPS_MATCH).build();
    }

    @Bean
    public Queue billingGenerateQueue() {
        return QueueBuilder.durable(QUEUE_BILLING_GENERATE).build();
    }

    // ==================== 绑定 ====================
    @Bean
    public Binding waybillStatusBinding() {
        return BindingBuilder.bind(waybillStatusQueue())
                .to(waybillExchange()).with(RK_WAYBILL_STATUS);
    }

    @Bean
    public Binding notificationBinding() {
        return BindingBuilder.bind(notificationSendQueue())
                .to(notificationExchange()).with(RK_NOTIFICATION_SEND);
    }

    @Bean
    public Binding exceptionBinding() {
        return BindingBuilder.bind(exceptionCreatedQueue())
                .to(exceptionExchange()).with(RK_EXCEPTION_CREATED);
    }

    @Bean
    public Binding costBinding() {
        return BindingBuilder.bind(costCalculateQueue())
                .to(waybillExchange()).with(RK_COST_CALCULATE);
    }

    @Bean
    public Binding gpsBinding() {
        return BindingBuilder.bind(gpsMatchQueue())
                .to(waybillExchange()).with(RK_GPS_MATCH);
    }

    @Bean
    public Binding billingBinding() {
        return BindingBuilder.bind(billingGenerateQueue())
                .to(waybillExchange()).with(RK_BILLING_GENERATE);
    }

    // ==================== 消息转换器 ====================
    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(new Jackson2JsonMessageConverter());
        return template;
    }
}
