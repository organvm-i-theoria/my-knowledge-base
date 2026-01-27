#!/bin/bash
# Setup git-secrets for the knowledge-base repository
# This script installs git-secrets hooks and configures patterns

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "         Git-Secrets Setup for Knowledge Base                   "
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if git-secrets is installed
if ! command -v git-secrets &> /dev/null; then
    echo "git-secrets is not installed."
    echo ""
    echo "Install it with:"
    echo "  macOS:  brew install git-secrets"
    echo "  Linux:  See https://github.com/awslabs/git-secrets#installing-git-secrets"
    echo ""
    exit 1
fi

echo "Installing git-secrets hooks..."
git secrets --install -f

echo ""
echo "Registering AWS patterns..."
git secrets --register-aws

echo ""
echo "Adding custom secret patterns..."

# OpenAI API Keys
git secrets --add 'sk-proj-[a-zA-Z0-9_-]{80,}'
git secrets --add 'sk-[a-zA-Z0-9]{48,}'

# Anthropic API Keys
git secrets --add 'sk-ant-api[a-zA-Z0-9_-]{90,}'
git secrets --add 'sk-ant-[a-zA-Z0-9_-]{40,}'

# GitHub Tokens
git secrets --add 'ghp_[a-zA-Z0-9]{36}'
git secrets --add 'gho_[a-zA-Z0-9]{36}'
git secrets --add 'github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}'

# Stripe Keys
git secrets --add 'sk_live_[a-zA-Z0-9]{24,}'
git secrets --add 'rk_live_[a-zA-Z0-9]{24,}'

# SendGrid
git secrets --add 'SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}'

# Slack Tokens
git secrets --add 'xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}'
git secrets --add 'xoxp-[0-9]{10,}-[0-9]{10,}-[0-9]{10,}-[a-f0-9]{32}'

echo ""
echo "Adding allowlist patterns (false positives to ignore)..."

# Environment variable patterns
git secrets --add --allowed 'process\.env\.[A-Z_]+'
git secrets --add --allowed 'os\.environ\['

# Type definitions
git secrets --add --allowed 'apiKey:\s*string'
git secrets --add --allowed 'secretKey:\s*string'

# Code patterns
git secrets --add --allowed 'const\s+\w+\s*=\s*process\.env'
git secrets --add --allowed 'let\s+\w+\s*=\s*process\.env'

# Placeholder values
git secrets --add --allowed 'your[_-]?api[_-]?key'
git secrets --add --allowed 'your[_-]?secret'
git secrets --add --allowed 'test[_-]?key'
git secrets --add --allowed 'example[_-]?'
git secrets --add --allowed 'placeholder'
git secrets --add --allowed '<[A-Z_]+>'

# Masked values
git secrets --add --allowed 'sk-\.\.\.'
git secrets --add --allowed '\*{4,}'
git secrets --add --allowed '\[REDACTED'

# Allow-secret annotations
git secrets --add --allowed 'allow-secret'
git secrets --add --allowed 'nosec'

# Test patterns
git secrets --add --allowed 'sk_test_'
git secrets --add --allowed 'sk-test'
git secrets --add --allowed 'test_token'

# SDK patterns
git secrets --add --allowed 'new\s+OpenAI\(\{'
git secrets --add --allowed 'new\s+Anthropic\(\{'
git secrets --add --allowed 'apiKey:\s*process\.env'

# Regex patterns in source code
git secrets --add --allowed '/sk-[a-zA-Z0-9]'
git secrets --add --allowed 'pattern.*sk-'
git secrets --add --allowed 'regex.*ghp_'

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "Setup complete!"
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "Git-secrets will now scan commits for secrets."
echo ""
echo "To test the setup, run:"
echo "  git secrets --scan"
echo ""
echo "To bypass the hook for a specific commit (use sparingly):"
echo "  git commit --no-verify -m 'message'"
echo ""
echo "To add an allowed pattern:"
echo "  git secrets --add --allowed 'pattern'"
echo ""
