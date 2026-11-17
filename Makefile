NODE ?= node
NODE_FLAGS := --disable-warning=ExperimentalWarning --env-file-if-exists=.env
RUN_DIR := .run
PID_FILE := $(RUN_DIR)/server.pid
LOG_FILE := $(RUN_DIR)/server.log

.DEFAULT_GOAL := help
.PHONY: help env dev start stop restart status logs password notify-test notify-ids reset check-node

help: ## Показать список команд
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check-node:
	@$(NODE) -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22||(a===22&&b<13)) { console.error("Нужен Node.js >= 22.13, установлен " + process.version); process.exit(1) }'

env: ## Создать .env из .env.example (если его ещё нет)
	@if [ -f .env ]; then echo ".env уже существует"; else cp .env.example .env && echo "Создан .env — задайте ADMIN_PASSWORD"; fi

dev: check-node ## Запуск в режиме разработки (перезапуск при изменениях)
	$(NODE) $(NODE_FLAGS) --watch server.js

start: check-node ## Запустить сервер в фоне (лог: .run/server.log)
	@mkdir -p $(RUN_DIR); \
	if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "Сервер уже запущен (PID $$(cat $(PID_FILE)))"; exit 0; \
	fi; \
	nohup $(NODE) $(NODE_FLAGS) server.js >> $(LOG_FILE) 2>&1 & echo $$! > $(PID_FILE); \
	sleep 1; \
	if kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "Сервер запущен (PID $$(cat $(PID_FILE))), лог: $(LOG_FILE)"; \
	else \
		echo "Сервер не запустился, последние строки лога:"; tail -n 20 $(LOG_FILE); rm -f $(PID_FILE); exit 1; \
	fi

stop: ## Остановить фоновый сервер
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		kill $$(cat $(PID_FILE)); \
		for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 $$(cat $(PID_FILE)) 2>/dev/null || break; sleep 0.5; done; \
		if kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then kill -9 $$(cat $(PID_FILE)); fi; \
		echo "Сервер остановлен"; \
	else \
		echo "Сервер не запущен"; \
	fi
	@rm -f $(PID_FILE)

restart: stop start ## Перезапустить фоновый сервер

status: ## Проверить, запущен ли сервер
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "Запущен (PID $$(cat $(PID_FILE)))"; else echo "Не запущен"; fi

logs: ## Смотреть лог фонового сервера
	@mkdir -p $(RUN_DIR) && touch $(LOG_FILE)
	tail -n 50 -f $(LOG_FILE)

password: check-node ## Сменить пароль админки: make password PASS=<новый>
	@if [ -z "$(PASS)" ]; then echo "Использование: make password PASS=<новый пароль>"; exit 1; fi
	@$(NODE) $(NODE_FLAGS) server/set-password.js "$(PASS)"

notify-test: check-node ## Отправить тестовое уведомление во все каналы
	$(NODE) --env-file-if-exists=.env server/notify-cli.js test

notify-ids: check-node ## Показать ID чатов Telegram/MAX
	$(NODE) --env-file-if-exists=.env server/notify-cli.js ids

reset: ## Остановить сервер и удалить локальную БД (data/) — при следующем запуске заполнится seed-данными
	@printf "Удалить data/ безвозвратно? [y/N] "; read ans; [ "$$ans" = "y" ] || { echo "Отменено"; exit 1; }
	@$(MAKE) --no-print-directory stop
	rm -rf data/
	@echo "data/ удалена. Запустите сервер заново: make start"
