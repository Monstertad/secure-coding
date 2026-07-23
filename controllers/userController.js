// 회원 정보 요청 처리
// - 본인 정보 조회/수정, 비밀번호 변경 요청 처리
// - 본인 소유 리소스인지(IDOR 방지) 확인 후 처리 (모두 세션의 본인 id만 사용, URL로 대상 id를 받지 않음)

const userService = require('../services/userService');

async function list(req, res, next) {
  try {
    const result = await userService.searchUsers({ q: req.query.q, page: req.query.page });
    res.render('users/users', result);
  } catch (err) {
    next(err);
  }
}

async function myPage(req, res, next) {
  try {
    const user = await userService.getProfile(req.session.user.id);
    res.render('users/profile', {
      user,
      bioValue: user.bio || '',
      bioErrors: [],
      passwordErrors: [],
      bioUpdated: req.query.bioUpdated === '1',
      passwordUpdated: req.query.passwordUpdated === '1',
    });
  } catch (err) {
    next(err);
  }
}

async function updateBio(req, res, next) {
  const { bio } = req.body;

  try {
    await userService.updateBio({ userId: req.session.user.id, bio });
    return res.redirect('/users/me?bioUpdated=1');
  } catch (err) {
    if (err instanceof userService.UserError) {
      const user = await userService.getProfile(req.session.user.id);
      return res.status(err.status).render('users/profile', {
        user,
        bioValue: bio || '',
        bioErrors: [err.message],
        passwordErrors: [],
        bioUpdated: false,
        passwordUpdated: false,
      });
    }
    return next(err);
  }
}

async function changePassword(req, res, next) {
  // newPassword/newPasswordConfirm 일치 여부는 routes/users.js의 passwordValidators에서 확인한다.
  const { currentPassword, newPassword } = req.body;

  try {
    await userService.changePassword({
      userId: req.session.user.id,
      currentPassword,
      newPassword,
    });

    // 비밀번호 변경처럼 민감한 계정 작업 이후에는 관례적으로 세션 ID를 재발급한다
    // (로그인 시 세션 고정 공격 방지 조치와 동일한 취지). 세션 데이터(로그인 상태)는
    // 그대로 복원하므로 사용자는 재로그인 없이 로그인 상태를 유지한다.
    const sessionUser = req.session.user;
    const maxAge = req.session.cookie.maxAge;

    req.session.regenerate((regenerateErr) => {
      if (regenerateErr) return next(regenerateErr);

      req.session.user = sessionUser;
      req.session.cookie.maxAge = maxAge;

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        return res.redirect('/users/me?passwordUpdated=1');
      });
    });
  } catch (err) {
    if (err instanceof userService.UserError) {
      const user = await userService.getProfile(req.session.user.id);
      return res.status(err.status).render('users/profile', {
        user,
        bioValue: user.bio || '',
        bioErrors: [],
        passwordErrors: [err.message],
        bioUpdated: false,
        passwordUpdated: false,
      });
    }
    return next(err);
  }
}

module.exports = { list, myPage, updateBio, changePassword };
