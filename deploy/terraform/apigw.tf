# ── API Gateway (public HTTPS entry point) ───────────────────────────────────────
# An HTTP API has no hourly charge and terminates TLS for free, so it stands in
# for an Application Load Balancer at this scale. It reaches the app privately:
#
#   internet ──HTTPS──> HTTP API ──> VPC link ──> Cloud Map ──> app task :3000
#
# Limits to know about: 30s per request and 10 MB per request body.

# Cloud Map keeps the app task's current private IP and port; ECS registers and
# deregisters tasks here as they start and stop.
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${var.app_name}.internal"
  vpc  = aws_vpc.main.id
}

resource "aws_service_discovery_service" "app" {
  name = "app"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"

    # SRV (not A) so the port is published too — API Gateway needs it.
    dns_records {
      type = "SRV"
      ttl  = 10
    }
  }

  # No Route 53 health check: ECS reports each task's health to Cloud Map.
  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_security_group" "vpc_link" {
  name_prefix = "${var.app_name}-apigw-link-sg-"
  description = "API Gateway VPC link - reaches app tasks inside the VPC"
  vpc_id      = aws_vpc.main.id

  # Scoped by CIDR rather than by the app security group, which already
  # references this one in its ingress (a group-to-group rule both ways would
  # be a dependency cycle).
  egress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  tags = { Name = "${var.app_name}-apigw-link-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

# The link's network interfaces sit in the private subnets: they only need to
# reach tasks over the VPC's local route, and never get public addresses there.
resource "aws_apigatewayv2_vpc_link" "main" {
  name               = "${var.app_name}-link"
  subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  security_group_ids = [aws_security_group.vpc_link.id]
}

resource "aws_apigatewayv2_api" "app" {
  name          = "${var.app_name}-app"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "app" {
  api_id             = aws_apigatewayv2_api.app.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.main.id
  integration_uri    = aws_service_discovery_service.app.arn
}

# Everything goes to the app; Next.js does its own routing.
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.app.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.app.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.app.id
  name        = "$default"
  auto_deploy = true
}
