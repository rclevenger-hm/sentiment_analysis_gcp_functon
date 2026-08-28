# Architecture

The deployment creates three Node.js Cloud Run functions: API, worker and recovery. They share the source artifact but use separate entry points and service accounts. Cloud Natural Language v1 is required for entity sentiment.

