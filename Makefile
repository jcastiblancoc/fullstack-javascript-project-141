.PHONY: setup install lint test clean build
# Updated: 2025-11-22 - Force cache bust

setup:
	npm run setup

install:
	npm install

lint:
	npm run lint

test:
	npm test

build:
	npm run build

clean:
	rm -rf node_modules dist public/dist data/*.sqlite3 .env
	rm -rf coverage

help:
	@echo "Available targets:"
	@echo "  make setup      - Create .env from code/.env.example or defaults"
	@echo "  make install    - Install dependencies"
	@echo "  make build      - Build frontend assets"
	@echo "  make test       - Run tests"
	@echo "  make clean      - Remove generated files and cache"
	@echo "  make lint       - Lint code (if eslint configured)"
	@echo "  make help       - Show this help message"
