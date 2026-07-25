# ── SSH Bastion (tunnel access to private RDS) ────────────────────────────────────
# Not part of the app runtime — exists purely so an operator can open a local
# Postgres client via SSH tunnel. Ingress is locked to a single trusted IP;
# update var.bastion_ssh_cidr when that IP changes and re-apply.

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "tls_private_key" "bastion" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "bastion" {
  key_name   = "${var.app_name}-bastion"
  public_key = tls_private_key.bastion.public_key_openssh
}

resource "local_sensitive_file" "bastion_private_key" {
  filename        = "${path.module}/bastion_key.pem"
  content         = tls_private_key.bastion.private_key_pem
  file_permission = "0600"
}

resource "aws_security_group" "bastion" {
  name        = "${var.app_name}-bastion-sg"
  description = "SSH bastion - allow SSH from a single trusted IP"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.bastion_ssh_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_name}-bastion-sg" }
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = "t3.micro"
  subnet_id                   = aws_subnet.public_a.id
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  key_name                    = aws_key_pair.bastion.key_name
  associate_public_ip_address = true

  tags = { Name = "${var.app_name}-bastion" }
}
