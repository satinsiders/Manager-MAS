# 프로덕션 선생님 API 가이드

📚 **API 가이드 목차**
- 학생 커리큘럼 목록 조회 API
- 학습분량 설정 API
- 학생 목록 조회 API
- 학습 스케줄 목록 조회 API
- 커리큘럼 목록 조회 API
- 학생 커리큘럼 수강권 지급 API

---

## 학생 커리큘럼 목록 조회 API

**Endpoint**
```http
GET https://prod-teacher-api.superfastsat.com/student-curriculums
```

**Headers**
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Query Parameters**

| 이름 | 타입 | 필수 | 설명 | 기본값 |
|------|------|------|------|--------|
| studentId | number | ✅ | 학생 ID | - |
| date | string | ❌ | 특정 날짜 필터 (YYYY-MM-DD) | - |
| includeStopped | boolean | ❌ | 중지된 커리큘럼 포함 여부 | false |
| includeNoRemainingDuration | boolean | ❌ | 남은 학습분량이 없는 커리큘럼 포함 여부 | false |

**Response: 200**
```json
[
  {
    "id": 123,
    "createdAt": "2024-01-01T09:00:00.000Z",
    "studentId": 456,
    "curriculumId": 789,
    "title": "초등 3학년 수학 기초과정",
    "lessonTotalCount": 24,
    "isStopped": false,
    "stoppedAt": null,
    "totalDuration": 720,
    "remainingDuration": 480
  },
  {
    "id": 124,
    "createdAt": "2024-01-05T10:00:00.000Z",
    "studentId": 456,
    "curriculumId": 790,
    "title": "초등 3학년 영어 읽기",
    "lessonTotalCount": 20,
    "isStopped": false,
    "stoppedAt": null,
    "totalDuration": 600,
    "remainingDuration": 300
  }
]
```

**응답 필드 설명**

| 필드명               | 타입             | 설명          |
| ----------------- | -------------- | ----------- |
| id                | number         | 학생커리큘럼 ID   |
| createdAt         | string         | 커리큘럼 할당 일시  |
| studentId         | number         | 학생 ID       |
| curriculumId      | number         | 커리큘럼 ID     |
| title             | string         | 커리큘럼 제목     |
| lessonTotalCount  | number         | 총 레슨 수      |
| isStopped         | boolean        | 중지 여부       |
| stoppedAt         | string \| null | 중지 일시       |
| totalDuration     | number         | 총 학습분량 (분)  |
| remainingDuration | number         | 남은 학습분량 (분) |

---

## 학습분량 설정 API

### 학습분량 설정

**Endpoint**
```http
POST https://prod-teacher-api.superfastsat.com/study-schedules/learning-volumes
```

**Headers**
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body (JSON)**

```json
{
  "studentCurriculumId": 123,
  "scheduledDate": "2024-01-15",
  "duration": 30
}
```

* studentCurriculumId: 학생커리큘럼 ID (필수)
* scheduledDate: 학습날짜 (YYYY-MM-DD, 필수)
* duration: 추가 학습분량(분, 필수)

**Response 예시 (201 Created)**

```text
// 응답 본문 없음
```

---

## 학생 목록 조회 API

**Endpoint**
```http
GET https://prod-teacher-api.superfastsat.com/students
```

**Headers**
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

**요청 파라미터**

| 이름        | 타입      | 필수 | 설명                | 기본값   |
| --------- | ------- | -- | ----------------- | ----- |
| onlyValid | boolean | ❌  | 유효한 매칭의 학생만 조회 여부 | false |

**Response: 200**

```json
[
  {
    "id": 123,
    "studySchedule": "월, 수, 금",
    "user": {
      "id": 456,
      "name": "김민수",
      "email": "minsu.kim@example.com"
    },
    "isValid": true},
  {
    "id": 124,
    "studySchedule": "화, 목",
    "user": {
      "id": 457,
      "name": "이지은",
      "email": "jieun.lee@example.com"
    },
    "isValid": true},
  {
    "id": 125,
    "studySchedule": "월, 수, 금",
    "user": {
      "id": 458,
      "name": "박준호",
      "email": "junho.park@example.com"
    },
    "isValid": false}
]
```

**응답 필드 설명**

| 필드명           | 타입      | 설명            |
| ------------- | ------- | ------------- |
| id            | number  | 학생 매칭 ID      |
| studySchedule | string  | 학습 일정(정규 수업일) |
| user          | object  | 사용자 정보        |
| user.id       | number  | 사용자 ID        |
| user.name     | string  | 학생 이름         |
| user.email    | string  | 학생 이메일        |
| isValid       | boolean | 매칭 유효 여부      |

---

## 학습스케줄 목록 조회 API

**Endpoint**
```http
GET https://prod-teacher-api.superfastsat.com/teacher/study-schedules
```

**Headers**
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

**요청 파라미터**

| 이름                  | 타입      | 필수 | 설명                        | 기본값   | 예시         |
| ------------------- | ------- | -- | ------------------------- | ----- | ---------- |
| studentId           | number  | ✅  | 학생 ID                     | -     | 123        |
| scheduledDate       | string  | ✅  | 학습 날짜 (YYYY-MM-DD)        | -     | 2024-01-15 |
| studentCurriculumId | number  | ❌  | 특정 커리큘럼 ID                | -     | 456        |
| excludeLecture      | boolean | ❌  | 강의 타입 제외 여부               | false | true       |
| isCorrect           | boolean | ❌  | 정답 여부 필터                  | -     | true       |
| confidence          | number  | ❌  | 정답 확신 수준 (0/25/50/75/100) | -     | 50         |
| subject             | string  | ❌  | 과목 필터                     | -     | MATH       |
| domainId            | number  | ❌  | 도메인 카테고리 ID               | -     | 10         |
| skillId             | number  | ❌  | 스킬 카테고리 ID                | -     | 20         |
| difficultyType      | string  | ❌  | 난이도 필터                    | -     | MEDIUM     |

**Response: 200**

```json
[
  {
    "studySchedule": {
      "id": 789,
      "scheduledStartAt": "2024-01-15T00:00:00.000Z",
      "scheduledEndAt": "2024-01-15T23:59:59.999Z",
      "scheduledDate": "2024-01-15",
      "totalDuration": 60,
      "student": {
        "id": 123,
        "studySchedule": "월, 수, 금",
        "user": {
          "id": 456,
          "name": "김민수"
        }
      }
    },
    "studyLessons": [
      {
        "id": 1001,
        "chapterId": 50,
        "lessonId": 100,
        "isFinalSubmitted": false,
        "isAssignment": false,
        "consecutiveCorrectCount": 2,
        "lesson": {
          "id": 100,
          "title": "3학년 1학기 - 덧셈과 뺄셈",
          "lessonType": "MATH"
        },
        "studyUnits": [
          {
            "id": 2001,
            "unitId": 300,
            "unitSeq": 1,
            "isCompleted": true,
            "isCorrect": true,
            "confidence": 75,
            "unit": {
              "id": 300,
              "title": "두 자리 수의 덧셈",
              "unitType": "CHOICE_PROBLEM",
              "difficultyType": "EASY"
            }
          },
          {
            "id": 2002,
            "unitId": 301,
            "unitSeq": 2,
            "isCompleted": false,
            "isCorrect": null,
            "confidence": null,
            "unit": {
              "id": 301,
              "title": "세 자리 수의 덧셈",
              "unitType": "SHORT_ANSWER_PROBLEM",
              "difficultyType": "MEDIUM"
            }
          }
        ]
      }
    ]
  }
]
```

**응답 필드 설명**

### StudySchedule

| 필드명              | 타입     | 설명          |
| ---------------- | ------ | ----------- |
| id               | number | 스케줄 ID      |
| scheduledStartAt | string | 학습 시작 예정 시각 |
| scheduledEndAt   | string | 학습 종료 예정 시각 |
| scheduledDate    | string | 학습 날짜       |
| totalDuration    | number | 총 학습분량 (분)  |
| student          | object | 학생 정보       |

### StudyLesson

| 필드명                     | 타입      | 설명       |
| ----------------------- | ------- | -------- |
| id                      | number  | 학습레슨 ID  |
| lessonId                | number  | 원본 레슨 ID |
| isFinalSubmitted        | boolean | 최종 제출 여부 |
| isAssignment            | boolean | 과제 여부    |
| consecutiveCorrectCount | number  | 연속 정답 횟수 |
| lesson                  | object  | 레슨 상세 정보 |
| studyUnits              | array   | 학습 유닛 목록 |

### StudyUnit

| 필드명         | 타입             | 설명       |
| ----------- | -------------- | -------- |
| id          | number         | 학습유닛 ID  |
| unitId      | number         | 원본 유닛 ID |
| unitSeq     | number         | 레슨 내 순서  |
| isCompleted | boolean        | 완료 여부    |
| isCorrect   | boolean / null | 정답 여부    |
| confidence  | number / null  | 정답 확신도   |
| unit        | object         | 유닛 상세 정보 |

---

## 커리큘럼 목록 조회 API

**Endpoint**
```http
GET https://prod-teacher-api.superfastsat.com/curriculums
```

**Headers**
```http
Authorization: Bearer {access_token}
```

**Query Parameters**

| 이름 | 타입 | 필수 | 설명 | 기본값 |
|------|------|------|------|--------|
| page | number | ❌ | 페이지 번호 | 1 |
| limit | number | ❌ | 페이지당 항목 수 | 20 |
| search | string | ❌ | 커리큘럼 제목 검색어 | - |

**Response 예시 (200 OK)**
```json
[
  {
    "id": 1,
    "createdAt": "2024-01-01T00:00:00Z",
    "originId": 100,
    "title": "중학교 1학년 수학"
  },
  {
    "id": 2,
    "createdAt": "2024-01-02T00:00:00Z",
    "originId": 101,
    "title": "중학교 1학년 영어"
  }
]
```

**응답 필드 설명**

| 필드명 | 타입 | 설명 |
| ------ | ----- | ---- |
| id | number | 커리큘럼 ID |
| createdAt | string | 커리큘럼 생성일 (ISO 8601 형식) |
| originId | number | 원본 커리큘럼 ID |
| title | string | 커리큘럼 제목 |

---

## 학생 커리큘럼 수강권 지급 API

**Endpoint**
```http
POST https://prod-teacher-api.superfastsat.com/courses
```

**Headers**
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body (JSON)**
```json
{
  "curriculumId": 1,
  "studentId": 123
}
```

* `curriculumId`: 커리큘럼 ID (필수)  
* `studentId`: 학생 ID (필수)

**Response 예시 (200 OK)**
```text
// 응답 본문 없음
```
