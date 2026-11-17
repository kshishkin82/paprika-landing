NODE ?= node
NODE_FLAGS := --disable-warning=ExperimentalWarning --env-file-if-exists=.env

.DEFAULT_GOAL := help
.PHONY: help env dev start password notify-test notify-ids reset check-node

help: ## Показать список команд
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check-node:
	@$(NODE) -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22||(a===22&&b<13)) { console.error("Нужен Node.js >= 22.13, установлен " + process.version); process.exit(1) }'

env: ## Создать .env из .env.example (если его ещё нет)
	@if [ -f .env ]; then echo ".env уже существует"; else cp .env.example .env && echo "Создан .env — задайте ADMIN_PASSWORD"; fi

dev: check-node ## Запуск в режиме разработки (перезапуск при изменениях)
	$(NODE) $(NODE_FLAGS) --watch server.js

start: check-node ## Запуск в production-режиме
	$(NODE) $(NODE_FLAGS) server.js

password: check-node ## Сменить пароль админки: make password PASS=<новый>
	@if [ -z "$(PASS)" ]; then echo "Использование: make password PASS=<новый пароль>"; exit 1; fi
	@$(NODE) $(NODE_FLAGS) server/set-password.js "$(PASS)"

notify-test: check-node ## Отправить тестовое уведомление во все каналы
	$(NODE) --env-file-if-exists=.env server/notify-cli.js test

notify-ids: check-node ## Показать ID чатов Telegram/MAX
	$(NODE) --env-file-if-exists=.env server/notify-cli.js ids

reset: ## Удалить локальную БД (data/) — при следующем запуске заполнится seed-данными
	@printf "Удалить data/ безвозвратно? [y/N] "; read ans; [ "$$ans" = "y" ] || { echo "Отменено"; exit 1; }
	rm -rf data/
	@echo "data/ удалена. Остановите сервер, если он запущен, и запустите заново."
