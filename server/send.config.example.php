<?php
/**
 * Образец настроек обработчика заявок.
 * Скопируйте файл в send.config.php и заполните. send.config.php НЕ храните в публичном репозитории.
 */
return [
    // Telegram: создайте бота у @BotFather, добавьте его в группу менеджеров.
    // chat_id группы можно узнать, переслав сообщение из группы боту @getmyid_bot (у групп id начинается с -100…).
    'telegram_bot_token' => '123456789:AA...',
    'telegram_chat_id'   => '-1001234567890',
    'telegram_thread_id' => null,          // id темы, если в группе включены темы

    // Email (необязательно). На многих хостингах mail() работает только с адреса вашего домена.
    'email_to'   => '',                    // например 'leads@example.ru'
    'email_from' => '',                    // например 'no-reply@example.ru'

    // CRM / вебхук (необязательно): JSON с полями заявки уйдёт POST-запросом.
    'webhook_url' => '',

    // Резервная копия заявок в CSV (необязательно). Путь — ВНЕ папки сайта.
    'backup_csv' => null,                  // например __DIR__ . '/../leads/leads.csv'

    // Защита
    'allowed_origins'    => ['https://example.ru', 'https://www.example.ru'],
    'rate_limit_seconds' => 60,            // одна заявка с IP раз в N секунд
    'min_fill_seconds'   => 2,             // заявки, заполненные быстрее, считаются спамом
    'salt'               => 'замените-на-случайную-строку',
];
