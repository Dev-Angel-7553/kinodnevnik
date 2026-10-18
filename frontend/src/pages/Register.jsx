import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import Stepper, { Step } from '../components/reactbits/Stepper/Stepper';
import { Field, Notice } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { RULES } from '../utils';
import { AuthScene } from './Login';

// Поля каждого шага — чтобы при ошибке сервера открыть нужный шаг
const STEP_FIELDS = [
  ['last_name', 'first_name', 'middle_name'],
  ['login', 'email'],
  ['password', 'password_confirm'],
];

const EMPTY = { last_name: '', first_name: '', middle_name: '', login: '', email: '', password: '', password_confirm: '' };

// Проверка на клиенте повторяет правила сервера; окончательная проверка — на сервере
function validate(form, fields) {
  const errors = {};
  const need = (key, ok, message) => fields.includes(key) && !ok && (errors[key] = message);
  need('last_name', RULES.name.test(form.last_name.trim()), 'Только буквы и дефис, от 2 символов');
  need('first_name', RULES.name.test(form.first_name.trim()), 'Только буквы и дефис, от 2 символов');
  need('middle_name', !form.middle_name.trim() || RULES.name.test(form.middle_name.trim()), 'Только буквы и дефис');
  need('login', RULES.login.test(form.login), 'Латиница, цифры и «_», от 3 до 32 символов');
  need('email', RULES.email.test(form.email.trim()), 'Введите email в формате name@example.ru');
  need('password', RULES.password.test(form.password), 'Минимум 8 символов, буква и цифра');
  need('password_confirm', form.password_confirm && form.password === form.password_confirm, 'Пароли не совпадают');
  return errors;
}

export default function Register() {
  const { user, register } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(1);
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/library" replace />;

  const set = key => e => {
    setForm({ ...form, [key]: e.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  const changeStep = next => {
    if (next < step) {
      setStep(next);
      return;
    }
    const found = validate(form, STEP_FIELDS.slice(0, next - 1).flat());
    setErrors(found);
    if (!Object.keys(found).length) setStep(next);
  };

  const submit = async () => {
    const found = validate(form, STEP_FIELDS.flat());
    setErrors(found);
    if (Object.keys(found).length) return;
    setLoading(true);
    setServerError('');
    try {
      const me = await register({ ...form, middle_name: form.middle_name.trim() || null });
      notify(`Аккаунт создан, ${me.first_name}!`, { description: 'Найдите первый фильм для дневника' });
      navigate('/search');
    } catch (err) {
      setErrors(err.fields || {});
      setServerError(err.message);
      const index = STEP_FIELDS.findIndex(group => group.some(f => err.fields?.[f]));
      if (index >= 0) setStep(index + 1);
    } finally {
      setLoading(false);
    }
  };

  const input = (key, props = {}) => (
    <input value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} {...props} />
  );

  return (
    <AuthScene width={480}>
      <h1>Создать дневник</h1>
      <p className="auth-card__lead">Три коротких шага, и можно отмечать фильмы.</p>
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <Stepper
            step={step}
            onStepChange={changeStep}
            onFinalStepCompleted={submit}
            linear
            width="100%"
            accentColor="#ecebe8"
            backButtonText="Назад"
            nextButtonText="Далее"
            completeButtonText={loading ? 'Создаём…' : 'Зарегистрироваться'}
            nextButtonProps={{ disabled: loading }}
            frame={false}
          >
            <Step title="ФИО">
              <div className="step-fields">
                <Field label="Фамилия *" error={errors.last_name}>{input('last_name', { autoComplete: 'family-name' })}</Field>
                <Field label="Имя *" error={errors.first_name}>{input('first_name', { autoComplete: 'given-name' })}</Field>
                <Field label="Отчество" error={errors.middle_name} hint="Необязательное поле">
                  {input('middle_name', { autoComplete: 'additional-name' })}
                </Field>
              </div>
            </Step>
            <Step title="Аккаунт">
              <div className="step-fields">
                <Field label="Логин *" error={errors.login} hint="Например: kino_lover">
                  {input('login', { autoComplete: 'username' })}
                </Field>
                <Field label="Email *" error={errors.email}>{input('email', { type: 'email', autoComplete: 'email' })}</Field>
              </div>
            </Step>
            <Step title="Пароль">
              <div className="step-fields">
                <Field label="Пароль *" error={errors.password} hint="Не менее 8 символов, буква и цифра">
                  {input('password', { type: 'password', autoComplete: 'new-password' })}
                </Field>
                <Field label="Повтор пароля *" error={errors.password_confirm}>
                  {input('password_confirm', { type: 'password', autoComplete: 'new-password' })}
                </Field>
                <p className="muted small">
                  Регистрируясь, вы принимаете <Link to="/rules">правила сервиса</Link>.
                </p>
              </div>
            </Step>
          </Stepper>
      <p className="auth-card__alt">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
    </AuthScene>
  );
}
