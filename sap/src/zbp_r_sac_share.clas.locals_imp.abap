CLASS lhc_share DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR share RESULT result.

    METHODS checkshare FOR VALIDATE ON SAVE
      IMPORTING keys FOR share~CheckShare.

    METHODS setowner FOR DETERMINE ON MODIFY
      IMPORTING keys FOR share~SetOwner.
ENDCLASS.

CLASS lhc_share IMPLEMENTATION.

  " a share is changed or removed by the user who made it (the owner of the object)
  METHOD get_instance_authorizations.
    READ ENTITIES OF zr_sac_share IN LOCAL MODE
      ENTITY share
        FIELDS ( OwnerId ) WITH CORRESPONDING #( keys )
      RESULT DATA(shares).

    DATA may TYPE abap_boolean.
    LOOP AT shares INTO DATA(share).
      may = xsdbool( share-OwnerId = zcl_sac_access=>user( ) ).
      APPEND VALUE #( %tky    = share-%tky
                %update = COND #( WHEN may = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized )
                %delete = COND #( WHEN may = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ) ) TO result.
    ENDLOOP.
  ENDMETHOD.


  " only the owner shares an object, only stories, models and actions, only for reading or editing, with a user name in capitals or with everyone (*)
  METHOD checkshare.
    READ ENTITIES OF zr_sac_share IN LOCAL MODE
      ENTITY share
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(shares).

    LOOP AT shares INTO DATA(share).
      DATA(problem) = ``.
      IF share-ObjectKind <> 'STORY' AND share-ObjectKind <> 'MODEL' AND share-ObjectKind <> 'DATAACTION' AND share-ObjectKind <> 'MULTIACTION' AND share-ObjectKind <> 'CALEVENT'.
        problem = `Only stories, models, actions and calendar events can be shared`.
      ELSEIF share-AccessLevel <> 'READ' AND share-AccessLevel <> 'WRITE'.
        problem = `The access of a share is READ or WRITE`.
      ELSEIF share-Principal IS INITIAL.
        problem = `Name a user, or * for everyone`.
      ELSEIF share-Principal <> '*' AND share-Principal <> to_upper( share-Principal ).
        problem = `Write the user name in capitals`.
      ELSEIF zcl_sac_access=>is_open( kind = share-ObjectKind id = share-ObjectId ) = abap_true.
        problem = `This object has no owner, so it is open to everyone and cannot be shared`.
      ELSEIF zcl_sac_access=>get_level( kind = share-ObjectKind id = share-ObjectId ) <> zcl_sac_access=>level-owner.
        problem = `Only the owner can share this object`.
      ENDIF.
      IF problem IS NOT INITIAL.
        APPEND VALUE #( %tky = share-%tky ) TO failed-share.
        APPEND VALUE #( %tky = share-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error text = problem ) ) TO reported-share.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD setowner.
    READ ENTITIES OF zr_sac_share IN LOCAL MODE
      ENTITY share
        FIELDS ( OwnerId ) WITH CORRESPONDING #( keys )
      RESULT DATA(shares).
    DELETE shares WHERE OwnerId IS NOT INITIAL.
    CHECK shares IS NOT INITIAL.
    MODIFY ENTITIES OF zr_sac_share IN LOCAL MODE
      ENTITY share
        UPDATE FIELDS ( OwnerId )
        WITH VALUE #( FOR s IN shares ( %tky = s-%tky OwnerId = zcl_sac_access=>user( ) ) ).
  ENDMETHOD.

ENDCLASS.
