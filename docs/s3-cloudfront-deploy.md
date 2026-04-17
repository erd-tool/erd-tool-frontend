# Frontend Static Deployment

이 문서는 `erd-tool-frontend`를 `S3 + CloudFront + GitHub Actions`로 배포하는 기준 설정을 정리합니다.

## Deployment Shape

- build: `npm ci -> npm run build`
- upload target: private S3 bucket
- delivery: CloudFront
- invalidation: `/`, `/index.html`
- API base URL: same-origin 유지
- collaboration URL: same-origin 유지

workflow에서는 아래 값을 고정합니다.

- `VITE_API_BASE_URL=""`
- `VITE_COLLAB_URL=""`

## Required GitHub Variables

Repository `Variables`에 아래 값을 설정합니다.

- `AWS_REGION`: S3 bucket이 속한 리전
- `AWS_ROLE_ARN`: GitHub Actions OIDC로 Assume 할 IAM Role ARN
- `S3_BUCKET_NAME`: 정적 파일을 올릴 bucket 이름
- `CLOUDFRONT_DISTRIBUTION_ID`: 배포 대상 CloudFront distribution id
- `S3_PREFIX`: 선택값. bucket 루트가 아닌 특정 prefix로 배포할 때만 사용

## Recommended AWS Auth

GitHub Actions에서는 장기 Access Key 대신 OIDC Assume Role 방식을 사용합니다.

### Trust Policy Example

`<aws-account-id>`를 실제 값으로 바꿔서 사용합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<aws-account-id>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:erd-tool/erd-tool-frontend:*"
        }
      }
    }
  ]
}
```

### Permission Policy Example

아래 예시는 최소 권한 기준입니다. `<bucket-name>`, `<aws-account-id>`, `<distribution-id>`는 실제 값으로 바꿉니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::<bucket-name>"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::<bucket-name>/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "arn:aws:cloudfront::<aws-account-id>:distribution/<distribution-id>"
    }
  ]
}
```

## Cache Policy Mapping

현재 `nginx.conf` 의도를 그대로 배포 스크립트에 옮깁니다.

- `index.html`: `no-store, no-cache, must-revalidate`
- `assets/*`: `public, max-age=31536000, immutable`
- 그 외 정적 파일: `no-store, no-cache, must-revalidate`

## Notes

- S3 bucket은 private + CloudFront OAC 구성을 권장합니다.
- SPA 새로고침 처리는 CloudFront custom error response에서 `403/404 -> /index.html (200)`로 처리합니다.
- 도메인이 없어도 CloudFront 기본 도메인으로 먼저 배포할 수 있습니다.
