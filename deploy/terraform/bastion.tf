# ── SSM Bastion (tunnel access to private RDS) ────────────────────────────────────
# Not part of the app runtime — exists purely so an operator can open a local
# Postgres client via an SSM port-forwarding session. No inbound ports, no SSH
# key, no IP allowlist to maintain — access is gated entirely by IAM, and every
# session is logged in CloudTrail.
#
# Connect with:
#   aws ssm start-session --region <region> --target <instance-id> \
#     --document-name AWS-StartPortForwardingSessionToRemoteHost \
#     --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5432"]}'
# Then point your Postgres client at localhost:5432 directly (no SSH tunnel needed).

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  # Excludes the "minimal" variant, which doesn't ship with the SSM agent
  # preinstalled — required for Session Manager access to this instance.
  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

resource "aws_iam_role" "bastion" {
  name = "${var.app_name}-bastion-ssm"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "bastion_ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.app_name}-bastion"
  role = aws_iam_role.bastion.name
}

resource "aws_security_group" "bastion" {
  name_prefix = "${var.app_name}-bastion-sg-"
  description = "SSM bastion - no inbound ports; SSM agent connects outbound only"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-bastion-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = "t3.micro"
  subnet_id                   = aws_subnet.public_a.id
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  iam_instance_profile        = aws_iam_instance_profile.bastion.name
  associate_public_ip_address = true

  tags = { Name = "${var.app_name}-bastion" }
}
