#!/bin/bash

# Environment Setup Script for VonatterKep
# Helps generate secure secrets and configure environment

set -e

echo "🔧 VonatterKep Environment Setup"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ENV_FILE=".env.local"

echo -e "${BLUE}This script will help you set up environment variables for deployment.${NC}"
echo ""

# Check if .env.local already exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  $ENV_FILE already exists.${NC}"
    read -p "Do you want to overwrite it? (y/N): " overwrite
    if [[ $overwrite != "y" && $overwrite != "Y" ]]; then
        echo "Exiting without changes."
        exit 0
    fi
fi

# Start creating the environment file
echo "# VonatterKep Environment Configuration" > "$ENV_FILE"
echo "# Generated on $(date)" >> "$ENV_FILE"
echo "" >> "$ENV_FILE"

# Function to add environment variable
add_env_var() {
    local var_name=$1
    local description=$2
    local default_value=$3
    local is_secret=${4:-false}
    
    echo -e "${BLUE}$description${NC}"
    
    if [ "$is_secret" = true ]; then
        read -s -p "Enter $var_name (input hidden): " value
        echo ""
    else
        read -p "Enter $var_name${default_value:+ (default: $default_value)}: " value
    fi
    
    # Use default if no value provided
    if [ -z "$value" ] && [ -n "$default_value" ]; then
        value="$default_value"
    fi
    
    echo "$var_name=$value" >> "$ENV_FILE"
    echo ""
}

# Generate secure random secrets
generate_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 32
    else
        # Fallback for systems without openssl
        head -c 32 /dev/urandom | base64
    fi
}

echo "1. Application URLs"
echo "=================="

add_env_var "NEXT_PUBLIC_API_URL" "Public API URL (where your app will be hosted)" "https://vonatterkep.yourdomain.com/api"
add_env_var "NEXTAUTH_URL" "NextAuth URL (same as your domain)" "https://vonatterkep.yourdomain.com"

echo "" >> "$ENV_FILE"
echo "# Mapbox Configuration" >> "$ENV_FILE"

echo "2. Mapbox Configuration"
echo "======================"
echo -e "${YELLOW}Get your Mapbox token from: https://account.mapbox.com/access-tokens/${NC}"

add_env_var "NEXT_PUBLIC_MAPBOX_TOKEN" "Mapbox access token (starts with 'pk.')" "" true

echo "" >> "$ENV_FILE"
echo "# Redis Configuration" >> "$ENV_FILE"

echo "3. Redis Configuration"
echo "====================="
echo -e "${YELLOW}This will be provided by Coolify when you create the Redis service.${NC}"

add_env_var "REDIS_URL" "Redis connection URL" "redis://password@vonatterkep-redis:6379"

echo "" >> "$ENV_FILE"
echo "# Security Secrets" >> "$ENV_FILE"

echo "4. Security Configuration"
echo "========================"
echo -e "${YELLOW}Generating secure random secrets...${NC}"

jwt_secret=$(generate_secret)
nextauth_secret=$(generate_secret)

echo "JWT_SECRET=$jwt_secret" >> "$ENV_FILE"
echo "NEXTAUTH_SECRET=$nextauth_secret" >> "$ENV_FILE"

echo -e "${GREEN}✅ Generated secure JWT_SECRET${NC}"
echo -e "${GREEN}✅ Generated secure NEXTAUTH_SECRET${NC}"

echo "" >> "$ENV_FILE"
echo "# Optional Services" >> "$ENV_FILE"

echo "5. Optional Configuration"
echo "========================"

read -p "Do you want to configure Sentry for error tracking? (y/N): " use_sentry
if [[ $use_sentry == "y" || $use_sentry == "Y" ]]; then
    add_env_var "SENTRY_DSN" "Sentry DSN for error tracking" ""
else
    echo "# SENTRY_DSN=your-sentry-dsn-here" >> "$ENV_FILE"
fi

echo "" >> "$ENV_FILE"
echo "# Node Environment" >> "$ENV_FILE"
echo "NODE_ENV=production" >> "$ENV_FILE"
echo "PORT=3000" >> "$ENV_FILE"

echo ""
echo -e "${GREEN}✅ Environment configuration complete!${NC}"
echo ""
echo "📄 Configuration saved to: $ENV_FILE"
echo ""
echo "Next steps:"
echo "1. Review the generated configuration in $ENV_FILE"
echo "2. Copy these values to your Coolify environment variables"
echo "3. Create Redis service in Coolify and update REDIS_URL"
echo "4. Deploy your application"
echo ""
echo -e "${YELLOW}⚠️  Important Security Notes:${NC}"
echo "- Never commit $ENV_FILE to version control"
echo "- Keep your Mapbox token secure"
echo "- Use the generated secrets as-is (they are cryptographically secure)"
echo ""
echo "🔍 To verify your deployment after it's live, run:"
echo "   ./scripts/verify-deployment.sh https://your-domain.com"