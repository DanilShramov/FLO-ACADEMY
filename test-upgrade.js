// FLO Academy release 1.0075
window.FLO_TESTS_VERSION=window.__FLO_RELEASE_VERSION__||'1.0075';

(()=>{
  let mode='practice';
  let reviewer=false;
  let questionCount=0;
  let allowCommittedChange=false;

  const confirmedQuestions=new Set();
  const originalFetch=window.fetch.bind(window);
  const originalConfirm=window.confirm.bind(window);

  const setMode=m=>{
    mode=m==='attestation'?'attestation':'practice';
    window.__floTestMode=mode;
  };

  /*
    Формулировки специально сделаны близкими по длине и логике.
    Правильный вариант больше не должен выделяться тем, что он единственный
    подробный и профессионально сформулированный.
    ID вариантов не меняются — серверная проверка остаётся прежней.
  */
  const PRO_OPTIONS={
    q001:{
      o1:'Сначала убрать стекло, затем отнести готовое блюдо, после этого подойти к гостю и в конце помочь коллеге с меню',
      o2:'Сначала обозначить и устранить риск со стеклом, параллельно обеспечить вынос блюда, затем ответить гостю и после помочь с меню',
      o3:'Сначала отнести горячее блюдо, затем обозначить опасную зону, после этого подойти к гостю и помочь коллеге с меню',
      o4:'Сначала дать гостю понять, что его заметили, затем отнести блюдо, после этого убрать стекло и помочь коллеге с меню'
    },
    q002:{
      o1:'Сначала подтвердить просьбу о счёте и начать расчёт, затем организовать вынос блюд, а звонок принять после расчёта',
      o2:'Сначала принять звонок и быстро зафиксировать запрос, затем забрать готовые блюда и после этого вернуться к расчёту',
      o3:'Сразу обеспечить вынос готовых блюд, подтвердить просьбу о счёте и вернуться к расчёту, а звонок принять либо передать',
      o4:'Сначала принести счёт, затем принять звонок, после чего забрать блюда и проверить их состояние перед подачей'
    },
    q003:{
      o1:'Сначала уточнить у гостя подробности аллергии, затем передать информацию кухне и продолжить обслуживание остальных столов',
      o2:'Немедленно остановить или уточнить приготовление по рабочему каналу и передать ограничение ответственным до продолжения заказа',
      o3:'Сначала передать информацию менеджеру, а кухню уведомить после его подтверждения, чтобы не останавливать приготовление заранее',
      o4:'Сначала проверить состав позиции по доступной информации и только при подтверждении риска связываться с кухней'
    },
    q004:{
      o1:'Поставить напитки на ближайшую безопасную поверхность, коротко ответить зовущему гостю и затем убрать риск у ребёнка',
      o2:'Сразу предотвратить риск у ребёнка, одновременно обозначить зовущему гостю, что вы его заметили, затем продолжить маршрут',
      o3:'Сначала завершить подачу напитков, чтобы не создавать новый риск с подносом, после чего вернуться к горячей посуде',
      o4:'Позвать ближайшего коллегу к ребёнку, а самому ответить зовущему гостю и закончить текущую подачу'
    },
    q005:{
      o1:'Оставить на последнюю очередь приветствие вошедшего гостя',
      o2:'Оставить на последнюю очередь замену прибора текущему столу',
      o3:'Оставить на последнюю очередь подтверждение информации по аллергену',
      o4:'Оставить на последнюю очередь фотографирование витрины для менеджера'
    },
    q006:{
      o1:'Сначала уточнить вкусовые предпочтения и предложить лучшие по вкусу позиции, даже если часть из них готовится немного дольше',
      o2:'Сразу сузить выбор до 2–3 позиций, укладывающихся во время гостя, озвучить реальные тайминги и контролировать заказ',
      o3:'Предложить один самый быстрый вариант и минимизировать дальнейший контакт, чтобы не тратить время гостя',
      o4:'Принять обычный заказ без дополнительных ограничений, но предупредить кухню, что гость ограничен по времени'
    },
    q007:{
      o1:'Отвечать только на точно известные детали, а более глубокие вопросы предложить уточнить у сомелье после основного выбора',
      o2:'Отвечать конкретно в пределах компетенции, не додумывать неизвестное и при необходимости сразу подключать специалиста',
      o3:'Дать краткое общее описание без углубления, чтобы не перегружать гостя профессиональной терминологией',
      o4:'Ответить на известную часть вопроса и предложить вернуться к остальным деталям позже, не прерывая текущий сервис'
    },
    q008:{
      o1:'Сузить выбор до трёх самых популярных блюд и предложить гостю сравнить их между собой',
      o2:'Уточнить 1–2 ключевых предпочтения, сузить выбор до 2–3 подходящих блюд и дать аргументированную рекомендацию',
      o3:'Назвать собственный любимый вариант и предложить ориентироваться на него, чтобы быстрее принять решение',
      o4:'Оставить два блюда, между которыми гость уже сомневается, и подробно сравнить их без дополнительных вопросов'
    },
    q009:{
      o1:'Снизить частоту подходов, но каждый контакт использовать для подробной проверки, всё ли устраивает гостей',
      o2:'Сохранить дистанционное наблюдение и подходить в логичных точках сервиса, не прерывая личный разговор',
      o3:'Оставить стол почти без контакта и ждать явного сигнала от гостей, чтобы не нарушать приватность',
      o4:'Сохранить обычный ритм обслуживания, но говорить тише и максимально сокращать каждую коммуникацию'
    },
    q010:{
      o1:'Поздравить гостей, поддержать настроение и предложить стандартный комплимент, если он предусмотрен для такого повода',
      o2:'Поддержать эмоциональный тон, сохранить профессиональные границы и найти уместный Delight Moment в пределах полномочий',
      o3:'Сделать сервис более неформальным и чаще включаться в общение, если гости сами активно вовлекают персонал',
      o4:'Сфокусироваться на точности сервиса, а эмоциональную часть оставить на десерт или финальное поздравление'
    },
    q011:{
      o1:'«Насколько я помню, состав такой, но я дополнительно уточню, если для вас это принципиально»',
      o2:'«Я назову основные ингредиенты, а точный состав при необходимости можно дополнительно уточнить у кухни»',
      o3:'«Я хочу ответить точно. Сейчас уточню полный состав и вернусь к вам с подтверждённой информацией»',
      o4:'«В составе нет ничего необычного, но я могу отдельно уточнить ингредиенты, которые вас интересуют»'
    },
    q012:{
      o1:'Коротко закончить текущую мысль и сразу предложить коллеге продолжить разговор в рабочей зоне',
      o2:'Сразу остановить обсуждение и перенести его в рабочую зону вне слышимости гостей',
      o3:'Перейти на более тихий голос и завершить обсуждение на месте, если вопрос требует быстрого решения',
      o4:'Сказать коллеге, что вернётесь к вопросу после обслуживания ближайшего стола, и не продолжать разговор сейчас'
    },
    q013:{
      o1:'«Такой вариант обычно не предусмотрен, но я могу предложить ближайшую доступную альтернативу»',
      o2:'«Я постараюсь это организовать и сразу уточню у менеджера, есть ли такая возможность»',
      o3:'«Я уточню, можем ли мы это организовать, и вернусь к вам с подтверждённым ответом»',
      o4:'«Мне нужно согласование менеджера, поэтому пока не могу подтвердить, что это получится»'
    },
    q014:{
      o1:'Предложить самый популярный лёгкий вариант без рыбы и уточнить предпочтения уже после реакции гостя',
      o2:'Уточнить, что для гостя значит «не тяжёлое», затем предложить 1–2 подходящих варианта и кратко сравнить их',
      o3:'Выбрать два наиболее лёгких блюда без рыбы и подробно описать их, не задавая дополнительных вопросов',
      o4:'Сначала исключить самые насыщенные позиции и предложить из оставшихся вариант с наиболее нейтральным вкусом'
    },
    q015:{
      o1:'Сообщить фактическое время ожидания, чтобы синхронизировать восприятие, затем уточнить текущий статус кухни',
      o2:'Признать ощущение ожидания, уточнить фактический статус на кухне и вернуться к гостю с точным обновлением',
      o3:'Извиниться за задержку и назвать обычный тайминг блюда как ориентир до получения ответа от кухни',
      o4:'Сразу подключить менеджера, не обсуждая время ожидания, чтобы он сам уточнил статус и дал ответ'
    },
    q016:{
      o1:'Уточнить правильный заказ, убрать неверное блюдо, затем выяснить с кухней причину и после этого запустить замену',
      o2:'Признать ошибку, убрать неверное блюдо, подтвердить правильный заказ, сразу запустить исправление и контролировать тайминг',
      o3:'Сначала запустить замену по памяти, затем уточнить у гостя детали и скорректировать заказ при необходимости',
      o4:'Убрать блюдо, подключить менеджера и дождаться его решения перед повторной отправкой заказа'
    },
    q017:{
      o1:'Сообщить стандартное время приготовления как ориентир и пообещать обновить информацию, если оно изменится',
      o2:'Подождать несколько минут до появления точного ответа от кухни, чтобы не беспокоить гостя неполной информацией',
      o3:'Проактивно сообщить о задержке, честно сказать, что точное время уточняется, и вернуться с обновлением',
      o4:'Сразу подключить менеджера и предложить альтернативу, не дожидаясь ответа кухни по текущему блюду'
    },
    q018:{
      o1:'Сначала быстро устранить воду, затем извиниться и уточнить у гостя, всё ли в порядке',
      o2:'Сразу признать ситуацию, извиниться, устранить последствия, проверить комфорт гостя и при необходимости подключить менеджера',
      o3:'Извиниться, предложить пересадку на соседнее место и после этого убрать воду, чтобы не мешать гостю',
      o4:'Убрать воду и попросить коллегу продолжить обслуживание стола, чтобы не акцентировать внимание на ситуации'
    },
    q019:{
      o1:'Кратко объяснить стандартную температуру подачи, затем уточнить, что именно не соответствует ожиданию гостя',
      o2:'Сначала уточнить ожидание и конкретную претензию, затем предложить решение в рамках стандарта и полномочий',
      o3:'Сразу предложить переделать блюдо, не обсуждая стандарт подачи, чтобы быстрее восстановить впечатление',
      o4:'Подключить менеджера до обсуждения решения, поскольку претензия может быть связана с особенностью блюда'
    },
    q020:{
      o1:'Уточнить у гостя спорную позицию и проверить её наличие в заказе, не пересматривая остальные позиции',
      o2:'Сначала сверить чек с последней версией заказа у официанта, затем при необходимости открыть историю действий',
      o3:'Спокойно сверить чек с заказом и историей действий, после чего объяснить результат или внести подтверждённую корректировку',
      o4:'Сразу убрать спорную позицию из расчёта, а причину расхождения выяснить после закрытия стола'
    },
    q021:{
      o1:'Сфокусироваться на бронированиях, ЛИД и загрузке зала, а изменения по продукту передать отдельно по ходу смены',
      o2:'Кратко пройти критичные изменения смены: продукт, бронирования и ЛИД, роли и зоны, риски и фокус сервиса',
      o3:'Сосредоточиться на распределении ролей и финансовом плане, а гостевые особенности разбирать по мере посадки',
      o4:'Передать только новые изменения относительно прошлой смены, не повторяя текущие риски и ключевые бронирования'
    },
    q022:{
      o1:'Передать его ближайшие столы одному конкретному официанту до возвращения, не меняя остальные зоны',
      o2:'Явно перераспределить наблюдение за его столами и ближайшими обязательствами, обозначив ответственность до возвращения',
      o3:'Попросить соседних официантов коллективно следить за зоной без отдельного назначения, чтобы сохранить гибкость',
      o4:'Оставить официанту его столы, но предупредить гостей, что он временно работает в отдельной зоне'
    },
    q023:{
      o1:'Уточнить номер стола, текущую стадию заказа и примерное время возвращения коллеги',
      o2:'Уточнить ближайшие обязательства: что заказано, что готовится, обещания, ограничения и когда коллега вернётся',
      o3:'Попросить коллегу перечислить только незакрытые задачи и самому восстановить остальной контекст по системе',
      o4:'Принять стол и сначала самому подойти к гостям, а детали уточнить у коллеги после первого контакта'
    },
    q024:{
      o1:'Зафиксировать задачу и срок, а проверять только если к сроку не пришло подтверждение от коллеги',
      o2:'Определить ожидаемый результат и срок, затем проверить закрытие задачи, особенно если она влияет на гостя',
      o3:'Передать задачу конкретному сотруднику и считать ответственность полностью переданной вместе с исполнением',
      o4:'Контролировать процесс по ходу выполнения, не дожидаясь финального результата, чтобы вовремя корректировать действия'
    },
    q025:{
      o1:'Уточнить, какие именно задачи не успевает сотрудник, и помочь закрыть самые срочные без изменения зон',
      o2:'Быстро оценить нагрузку, временно перераспределить конкретные столы и задачи и определить момент возврата к обычной схеме',
      o3:'Передать часть зоны ближайшему сотруднику до конца смены, чтобы не менять распределение несколько раз',
      o4:'Оставить сотруднику текущие столы, но снять с него внутренние задачи до снижения нагрузки'
    },
    q026:{
      o1:'Забрать только ту посуду, которая находится прямо на маршруте, даже если текущая задача требует быстрого выполнения',
      o2:'Забрать то, что можно безопасно взять по пути без задержки более приоритетной задачи и изменения маршрута',
      o3:'Сначала завершить текущий маршрут, а использованную посуду забрать отдельным проходом, чтобы не смешивать задачи',
      o4:'Передать посуду ближайшему свободному коллеге, сохранив собственный маршрут и темп текущей задачи'
    },
    q027:{
      o1:'Когда посуда находится немного в стороне от основного маршрута и требует небольшого изменения траектории',
      o2:'Когда есть более срочная задача — безопасность, готовое блюдо или критичный прямой запрос гостя',
      o3:'Когда в руках уже есть один предмет и дополнительная посуда может сделать проход менее удобным',
      o4:'Когда коллега находится ближе к посуде и может забрать её без изменения своего маршрута'
    },
    q028:{
      o1:'Быстро восстановить только посадочные места, а недостающие элементы добавить сразу после размещения гостей',
      o2:'Организовать полное восстановление стола до стандарта, распределив действия между доступными сотрудниками',
      o3:'Попросить гостей подождать ещё немного и поручить восстановление одному ответственному сотруднику без параллельной помощи',
      o4:'Посадить гостей после уборки поверхности, а сервировку завершить сразу после приветствия и подачи меню'
    },
    q029:{
      o1:'Сместить стул ближе к столу сразу, если это можно сделать одним движением без обращения к гостям',
      o2:'Безопасно вернуть стул в согласованное положение, при необходимости попросив коллегу помочь',
      o3:'Оставить стул до ближайшей паузы в сервисе, заранее предупредив коллег о суженном проходе',
      o4:'Изменить маршрут персонала вокруг стула до освобождения стола, чтобы не вмешиваться в гостевую зону'
    },
    q030:{
      o1:'Завершить текущий небольшой этап пополнения, чтобы не оставлять рабочую зону незакрытой, затем забрать блюдо',
      o2:'Остановить второстепенную задачу в безопасной точке и сразу обеспечить своевременный вынос готового блюда',
      o3:'Попросить ближайшего сотрудника забрать блюдо после завершения его текущего действия, не прерывая пополнение',
      o4:'Оценить, сколько осталось до окончания пополнения, и если меньше минуты — закончить его перед выносом'
    },
    q031:{
      o1:'Оценить возраст вина и заранее выбрать мягкую декантацию, если вино достаточно зрелое',
      o2:'Оценить состояние конкретной бутылки, наличие осадка и стиль вина и только после этого решать вопрос декантации',
      o3:'Ориентироваться прежде всего на винтаж: старые вина подавать без длительной аэрации, молодые — декантировать',
      o4:'Следовать единому алгоритму для конкретного наименования, чтобы подача не зависела от оценки отдельной бутылки'
    },
    q032:{
      o1:'Позволяет наливать вино по бокалам с минимальной аэрацией и одновременно контролировать температуру подачи',
      o2:'Позволяет наливать вино без извлечения пробки, сохраняя возможность дальнейшего хранения бутылки',
      o3:'Позволяет быстро насыщать вино кислородом перед подачей, не переливая его в отдельный декантер',
      o4:'Позволяет открывать зрелые бутылки с хрупкой пробкой без риска её повреждения и крошения'
    },
    q033:{
      o1:'Уточнить вкусовые предпочтения и предложить наиболее универсальное сочетание из тех вин, которые вы хорошо знаете',
      o2:'Уточнить предпочтения гостя и передать сомелье контекст блюда и запроса для точной рекомендации',
      o3:'Предложить два вина разных стилей и кратко объяснить, как каждое будет работать с блюдом, не подключая сомелье',
      o4:'Сначала выяснить бюджет, затем выбрать подходящее по стилю вино по карте и при сомнении уточнить после заказа'
    },
    q034:{
      o1:'Отложить бокал, проверить, исчезает ли запах после проветривания, и использовать только при полном отсутствии запаха',
      o2:'Сразу заменить бокал до подачи и отдельно проверить новый на чистоту и отсутствие постороннего запаха',
      o3:'Промыть бокал водой на баре, тщательно высушить и использовать после повторной визуальной проверки',
      o4:'Подать вино в другом подходящем типе бокала, если чистого идентичного бокала временно нет'
    },
    q035:{
      o1:'Сравнить два вина по кислотности и телу, а выбор сделать по тому, какое обычно чаще берут к этому блюду',
      o2:'Связать запрос гостя с конкретными характеристиками обоих вин и коротко объяснить, чем они отличаются',
      o3:'Сначала назвать более свежее из двух вин, а затем отдельно предупредить, какое из них заметнее выдержано в дубе',
      o4:'Описать регион и сорт обоих вин и предложить гостю выбрать по происхождению без лишних технических деталей'
    },
    q036:{
      o1:'Зафиксировать информацию в заметке брони и отдельно передать её менеджеру смены устно',
      o2:'Зафиксировать фактическую информацию в принятом поле или канале так, чтобы она была доступна всей нужной смене',
      o3:'Записать информацию в свободном комментарии вместе со своей оценкой того, насколько она важна',
      o4:'Передать информацию ответственному за посадку в день визита и не перегружать карточку брони дополнительными деталями'
    },
    q037:{
      o1:'Подтверждённое предпочтение по посадке, которое гость неоднократно озвучивал',
      o2:'Фактическое ограничение по продукту или сервису, сообщённое самим гостем',
      o3:'Субъективный ярлык о характере гостя без конкретных наблюдаемых фактов',
      o4:'Согласованный повод визита, который может помочь подготовить обслуживание'
    },
    q038:{
      o1:'Предложить ближайшее доступное время и сразу поставить предварительную бронь, пока гость принимает решение',
      o2:'Проверить реальные альтернативы по времени или зоне и предложить их, а при наличии процесса зафиксировать ожидание',
      o3:'Предложить гостю прийти к нужному времени без гарантии, рассчитывая на возможное освобождение стола',
      o4:'Попросить гостя перезвонить ближе к визиту, когда станет понятнее фактическая загрузка зала'
    },
    q039:{
      o1:'Использовать известные предпочтения как основу разговора и не переспрашивать детали, которые уже есть в профиле',
      o2:'Использовать релевантный контекст ненавязчиво, но заново подтвердить актуальные детали текущего бронирования',
      o3:'Сначала подтвердить только имя и дату, а остальные параметры автоматически взять из последнего визита',
      o4:'Упомянуть сохранённое предпочтение и предложить повторить прошлую бронь, если гость сам не обозначил изменения'
    },
    q040:{
      o1:'Обновить количество гостей в брони и подтвердить изменение, если разница небольшая относительно первоначальной',
      o2:'Обновить бронь, проверить фактическую возможность размещения нового количества и только потом подтвердить гостю',
      o3:'Сохранить исходную бронь, а новое количество добавить в комментарий, чтобы решение приняла смена в день визита',
      o4:'Предложить гостю сохранить старую бронь и решить вопрос с дополнительными местами непосредственно при посадке'
    }
  };

  function rewriteQuestions(data){
    if(!data || !Array.isArray(data.questions))return false;
    let changed=false;

    data.questions=data.questions.map(q=>{
      const copy=PRO_OPTIONS[q.id];
      if(!copy || !Array.isArray(q.options))return q;

      changed=true;
      return {
        ...q,
        options:q.options.map(o=>copy[o.id]?{...o,text:copy[o.id]}:o)
      };
    });

    return changed;
  }

  function rewrittenResponse(response,data){
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.set('Cache-Control','no-store');
    headers.set('X-FLO-Version','1.0075');

    return new Response(JSON.stringify(data),{
      status:response.status,
      statusText:response.statusText,
      headers
    });
  }

  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:(input?.url||'');

    if(url.includes('/api/tests') && url.includes('action=start') && init.body){
      try{
        const body=JSON.parse(init.body);
        body.mode=mode;
        init={...init,body:JSON.stringify(body)};
      }catch{}
    }

    const response=await originalFetch(input,init);

    if(url.includes('/api/tests') && url.includes('action=catalog')){
      try{
        const data=await response.clone().json();
        reviewer=!!data.reviewer;
        questionCount=Number(data.questionCount)||0;
        setTimeout(enhance,0);
      }catch{}
    }

    if(url.includes('/api/tests')){
      try{
        const data=await response.clone().json();
        if(rewriteQuestions(data))return rewrittenResponse(response,data);
      }catch{}
    }

    return response;
  };

  window.confirm=function(message){
    const s=String(message||'');

    if(s.includes('10 минут на 10 вопросов')){
      if(mode==='attestation'){
        return originalConfirm('Начать аттестацию? 20 вопросов, 20 минут. Проходной результат — 85%.');
      }
      return true;
    }

    if(s.includes('Ответы выбраны на') && s.includes('из 10 вопросов')){
      return originalConfirm(s.replace('из 10 вопросов','из 20 вопросов'));
    }

    return originalConfirm(message);
  };

  async function token(){
    const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js');
    return getAuth().currentUser?.getIdToken();
  }

  async function post(action,body){
    const t=await token();
    const r=await originalFetch('/api/tests?'+new URLSearchParams({action}),{
      method:'POST',
      headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Ошибка');
    return d;
  }

  function injectProStyles(){
    if(document.getElementById('floTestProStyles'))return;

    const style=document.createElement('style');
    style.id='floTestProStyles';
    style.textContent=`
      .questionStep.answered{background:#ecece8!important;color:#44504b!important}
      #runnerConfirmAnswer{width:100%;flex-basis:100%;order:-1;margin:0 0 8px!important}
      .floTestChoiceGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
      .floTestChoiceGrid button{width:100%;margin:0}
      @media(max-width:600px){.floTestChoiceGrid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function removeOldAttestationTile(){
    document.getElementById('employeeAttestationTile')?.remove();

    const tests=document.getElementById('employeeTestsTile');
    if(tests && !tests.dataset.modeHook){
      tests.dataset.modeHook='1';
      tests.addEventListener('click',()=>setMode('practice'),true);
    }
  }

  function roleTabs(){
    const overview=document.querySelector('[data-test-page="overview"]');
    const catalog=document.querySelector('[data-test-page="catalog"]');
    const history=document.querySelector('[data-test-page="history"]');
    const results=document.querySelector('[data-test-page="results"]');
    const review=document.querySelector('[data-test-page="review"]');

    if(overview)overview.classList.toggle('hidden',!reviewer);
    if(catalog)catalog.classList.remove('hidden');
    if(history)history.classList.toggle('hidden',reviewer);
    if(results)results.classList.toggle('hidden',!reviewer);
    if(review)review.classList.toggle('hidden',!reviewer);

    if(!reviewer){
      const view=document.getElementById('testsView');
      const active=overview?.classList.contains('isSelected');
      if(view && !view.classList.contains('hidden') && active)catalog?.click();
    }
  }

  function overview(){
    const tab=document.querySelector('[data-test-page="overview"]');
    if(!reviewer || !tab?.classList.contains('isSelected'))return;

    const content=document.getElementById('testsContent');
    if(!content)return;

    const current=content.querySelector('#floReviewerOverview');
    const desired=String(questionCount||'—');

    if(current){
      const value=current.querySelector('b');
      if(value && value.textContent!==desired)value.textContent=desired;
      return;
    }

    content.innerHTML=`
      <div id="floReviewerOverview" class="testStats" style="grid-template-columns:1fr">
        <div><b>${desired}</b><span>вопросов в банке</span></div>
      </div>
    `;
  }

  function startRandom(cards,nextMode){
    setMode(nextMode);

    const buttons=[...cards.querySelectorAll('.startTest:not(:disabled)')];

    if(!buttons.length){
      document.getElementById('catalogResume')?.click();
      return;
    }

    buttons[Math.floor(Math.random()*buttons.length)].click();
  }

  function catalog(){
    const tab=document.querySelector('[data-test-page="catalog"]');
    if(!tab?.classList.contains('isSelected'))return;

    const content=document.getElementById('testsContent');
    const cards=content?.querySelector('.testCatalog');

    if(!content || !cards || content.querySelector('#practiceRandomStart'))return;

    cards.style.display='none';

    const h=content.querySelector('h2');
    if(h)h.textContent='Тестирование';

    [...content.querySelectorAll('p.sub,p.meta')].forEach(p=>p.style.display='none');

    const box=document.createElement('div');
    box.className='notice';
    box.innerHTML='<b>Случайный вариант · 20 вопросов</b><br>Конкретный вариант выбрать нельзя.';

    const actions=document.createElement('div');
    actions.className='floTestChoiceGrid';

    const practice=document.createElement('button');
    practice.id='practiceRandomStart';
    practice.className='primary';
    practice.textContent='Пройти тест';
    practice.onclick=()=>startRandom(cards,'practice');

    actions.appendChild(practice);

    // Аттестация нужна линейному персоналу. Управляющему оставляем обычный тест.
    if(!reviewer){
      const att=document.createElement('button');
      att.id='attestationRandomStart';
      att.className='secondary';
      att.textContent='Пройти аттестацию';
      att.onclick=()=>startRandom(cards,'attestation');
      actions.appendChild(att);
    }

    cards.before(box,actions);
  }

  function currentQuestionNumber(){
    const text=document.querySelector('#runnerQuestion .tileEyebrow')?.textContent||'';
    const match=text.match(/ВОПРОС\s+(\d+)/i);
    return match?Number(match[1]):null;
  }

  function installAnswerConfirmation(){
    const overlay=document.getElementById('testRunner');
    if(!overlay || overlay.dataset.confirmInstalled)return;

    overlay.dataset.confirmInstalled='1';

    overlay.addEventListener('change',e=>{
      if(allowCommittedChange)return;

      const input=e.target;
      if(!(input instanceof HTMLInputElement) || !input.closest('#runnerQuestion'))return;

      e.stopImmediatePropagation();

      const q=currentQuestionNumber();
      if(q)confirmedQuestions.delete(q);

      setTimeout(ensureConfirmButton,0);
    },true);
  }

  function ensureConfirmButton(){
    const overlay=document.getElementById('testRunner');
    if(!overlay || overlay.classList.contains('hidden'))return;

    const question=document.getElementById('runnerQuestion');
    const bottom=overlay.querySelector('.runnerBottom');

    if(!question || !bottom || question.classList.contains('hidden'))return;

    let btn=document.getElementById('runnerConfirmAnswer');

    if(!btn){
      btn=document.createElement('button');
      btn.id='runnerConfirmAnswer';
      btn.className='primary';
      bottom.prepend(btn);

      btn.onclick=()=>{
        const inputs=[...question.querySelectorAll('input')];
        const checked=inputs.filter(x=>x.checked);

        if(!checked.length){
          alert('Сначала выберите ответ.');
          return;
        }

        const q=currentQuestionNumber();

        allowCommittedChange=true;
        try{
          checked[0].dispatchEvent(new Event('change',{bubbles:true}));
        }finally{
          allowCommittedChange=false;
        }

        if(q)confirmedQuestions.add(q);

        btn.disabled=true;
        btn.textContent='Ответ подтверждён';
      };
    }

    const q=currentQuestionNumber();
    const hasChoice=!!question.querySelector('input:checked');
    const confirmed=q && confirmedQuestions.has(q);

    const desiredDisabled=!hasChoice || !!confirmed;
    const desiredText=confirmed?'Ответ подтверждён':'Подтвердить ответ';

    if(btn.disabled!==desiredDisabled)btn.disabled=desiredDisabled;
    if(btn.textContent!==desiredText)btn.textContent=desiredText;
  }

  function normalizeSaveWarning(){
    const state=document.getElementById('runnerSaveState');
    const notice=document.getElementById('runnerNotice');

    if(!notice)return;

    if(
      (state?.textContent||'').includes('Ответы сохранены') &&
      (notice.textContent||'').includes('Load failed')
    ){
      notice.innerHTML='';
      return;
    }

    const error=notice.querySelector('.notice.error');

    if(error && (error.textContent||'').includes('Load failed')){
      error.classList.remove('error');
      error.style.background='#fff4d6';
      error.style.color='#6a5620';
      error.textContent='Ответ пока не сохранился. Не закрывайте страницу: при перезагрузке несохранённый ответ будет потерян.';

      const q=currentQuestionNumber();
      if(q)confirmedQuestions.delete(q);

      ensureConfirmButton();
    }
  }

  function runner(){
    const overlay=document.getElementById('testRunner');
    if(!overlay || overlay.classList.contains('hidden'))return;

    installAnswerConfirmation();

    const title=document.getElementById('runnerTitle')?.textContent||'';
    const att=title.includes('Аттестация');

    const clock=overlay.querySelector('.runnerClock');
    if(clock)clock.style.display=att?'flex':'none';

    const label=document.getElementById('runnerLabel');
    if(label && !label.textContent.includes('ЧЕРНОВИКА')){
      const desiredLabel=att?'АТТЕСТАЦИЯ':'ПРОХОЖДЕНИЕ';
      if(label.textContent!==desiredLabel)label.textContent=desiredLabel;
    }

    const state=document.getElementById('runnerSaveState');
    if(state && !att && state.textContent.includes('Таймер')){
      state.textContent='Ответ сохраняется после подтверждения.';
    }

    const walker=document.createTreeWalker(overlay,NodeFilter.SHOW_TEXT);
    let node;

    while(node=walker.nextNode()){
      if(node.nodeValue.includes('ИЗ 10'))node.nodeValue=node.nodeValue.replaceAll('ИЗ 10','ИЗ 20');
      if(node.nodeValue.includes(' / 10'))node.nodeValue=node.nodeValue.replaceAll(' / 10',' / 20');
    }

    const hero=overlay.querySelector('.resultHero');

    if(att && hero && !hero.querySelector('.attestationStatus')){
      const match=(hero.textContent||'').match(/(\d+)%/);

      if(match){
        const passed=Number(match[1])>=85;
        const p=document.createElement('p');
        p.className='attestationStatus';
        p.innerHTML='<b>'+(passed?'СДАНО':'НЕ СДАНО')+'</b>';
        hero.appendChild(p);
      }
    }

    ensureConfirmButton();
    normalizeSaveWarning();
  }

  function history(){
    document.querySelectorAll('.historyRow').forEach(row=>{
      const pill=row.querySelector('.resultPill');
      if(!pill)return;

      pill.childNodes.forEach(n=>{
        if(n.nodeType===3)n.nodeValue=n.nodeValue.replace(' / 10',' / 20');
      });

      const title=row.querySelector('b')?.textContent||'';

      if(title.includes('Аттестация') && !pill.querySelector('.attStatus')){
        const match=(pill.textContent||'').match(/(\d+)%/);

        if(match){
          const status=document.createElement('small');
          status.className='attStatus';
          status.textContent=Number(match[1])>=85?'Сдано':'Не сдано';
          pill.appendChild(status);
        }
      }
    });
  }

  function review(){
    const tab=document.querySelector('[data-test-page="review"]');
    if(!reviewer || !tab?.classList.contains('isSelected'))return;

    const content=document.getElementById('testsContent');
    const bank=content?.querySelector('.reviewBank');

    if(!content || !bank || document.getElementById('customQuestionForm'))return;

    content.querySelectorAll('.notice').forEach(n=>{
      if(n.textContent.includes('Банк:')){
        n.textContent=`Банк: ${questionCount} вопросов. Проверьте формулировки и ключи.`;
      }
    });

    const form=document.createElement('form');
    form.id='customQuestionForm';
    form.innerHTML=`
      <div class="rule"></div>
      <h2>Добавить свой вопрос</h2>
      <select name="type">
        <option value="single">Один правильный ответ</option>
        <option value="multi">Несколько правильных ответов</option>
      </select>
      <input name="topic" placeholder="Тема" value="Сервис">
      <textarea name="prompt" placeholder="Вопрос" required style="width:100%;min-height:90px;padding:14px;border:1px solid var(--line);border-radius:13px"></textarea>
      <div id="customOptions"></div>
      <textarea name="explanation" placeholder="Пояснение к правильному ответу" style="width:100%;min-height:70px;padding:14px;border:1px solid var(--line);border-radius:13px"></textarea>
      <button class="primary" type="submit">Добавить вопрос</button>
      <div id="customQuestionMsg"></div>
    `;

    const opts=form.querySelector('#customOptions');

    for(let i=0;i<4;i++){
      const label=document.createElement('label');
      label.className='checkItem';
      label.innerHTML=`
        <input type="checkbox" name="correct" value="${i}">
        <input name="option${i}" placeholder="Вариант ${i+1}" required style="margin:0">
      `;
      opts.appendChild(label);
    }

    form.onsubmit=async e=>{
      e.preventDefault();

      const msg=form.querySelector('#customQuestionMsg');
      msg.textContent='Сохраняем…';

      try{
        const data=new FormData(form);
        const type=data.get('type');
        const correct=data.getAll('correct').map(Number);
        const options=[0,1,2,3].map(i=>data.get('option'+i));

        if(type==='single' && correct.length!==1){
          throw new Error('Для одиночного вопроса отметьте ровно один правильный вариант.');
        }

        if(type==='multi' && correct.length<2){
          throw new Error('Для вопроса с несколькими ответами отметьте минимум два правильных варианта.');
        }

        await post('custom-add',{
          type,
          topic:data.get('topic'),
          prompt:data.get('prompt'),
          options,
          correct,
          explanation:data.get('explanation')
        });

        msg.textContent='Вопрос добавлен.';
        questionCount++;
        setTimeout(()=>tab.click(),350);
      }catch(err){
        msg.textContent=err.message;
      }
    };

    bank.before(form);
  }

  function enhance(){
    injectProStyles();
    removeOldAttestationTile();
    roleTabs();
    overview();
    catalog();
    runner();
    history();
    review();
  }

  const observer=new MutationObserver(()=>enhance());

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      enhance();
      observer.observe(document.body,{subtree:true,childList:true});
    });
  }else{
    enhance();
    observer.observe(document.body,{subtree:true,childList:true});
  }
})();

